import json
import uuid
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.rag import Conversation, ChatMessage
from app.schemas.interview import (
    InterviewProfile,
    InterviewQuestion,
    InterviewEvaluation,
    InterviewTurnResponse,
    InterviewFinalReport,
)
from app.services.ai import get_ai_provider
from app.rag.pipeline import rag_pipeline


class InterviewService:
    def __init__(self):
        self.ai = get_ai_provider()
        self.rag = rag_pipeline

    async def start_interview(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        topic: str,
        source_types: list[str] | None = None,
    ) -> InterviewTurnResponse:
        """Initialize the interview and return Q1."""
        if not self.ai:
            raise ValueError("AI provider is not configured.")

        # 1. Fetch user context (Resumes/Jobs) via RAG or DB
        # For a thorough mock interview, we just search for general background
        search_results = await self.rag.search(db, user_id, "background skills projects experience education", source_types=source_types, top_k=10)
        context_text = self.rag.build_context(search_results)

        # 2. Extract Interview Profile
        profile_sys = (
            "You are a talent acquisition expert. Analyze the candidate's context documents "
            "and extract a structured profile. DO NOT invent any information. If a field is unknown, leave it empty. "
            "Return the output as a valid JSON object EXACTLY matching this structure:\n"
            '{"target_role": "string", "experience_level": "string", "skills": ["string"], "projects": ["string"], "education": ["string"], "experience": ["string"], "missing_information": ["string"]}'
        )
        profile_prompt = f"Target Interview Topic: {topic}\n\nCandidate Context:\n{context_text}"
        
        profile_json = await self.ai.generate_json(profile_sys, profile_prompt, max_tokens=1000)
        profile = InterviewProfile(**profile_json)

        # 3. Create Conversation
        conv = Conversation(
            user_id=user_id,
            title=f"Mock Interview: {topic}",
            metadata_json={"interview_profile": profile.model_dump(mode="json"), "topic": topic}
        )
        db.add(conv)
        await db.flush()

        # 4. Generate Q1
        q_sys = (
            "You are an expert technical and behavioral interviewer. "
            "Based on the candidate's profile and the interview topic, generate the FIRST question of the interview. "
            "The question must be directly related to their actual profile facts. "
            "Do NOT ask about experiences they haven't explicitly listed. "
            "Return a valid JSON object EXACTLY matching this structure:\n"
            '{"question": "string", "category": "string", "difficulty": "string", "basis": ["string"], "expected_topics": ["string"]}'
        )
        profile_text = "\n".join(f"- {k}: {v}" for k, v in profile.model_dump().items())
        q_prompt = f"Topic: {topic}\nCandidate Profile Details:\n{profile_text}"
        
        q1_json = await self.ai.generate_json(q_sys, q_prompt, max_tokens=800)
        q1 = InterviewQuestion(**q1_json)

        # 5. Save Q1 to DB
        msg = ChatMessage(
            conversation_id=conv.id,
            user_id=user_id,
            role="assistant",
            content=json.dumps({"type": "question", "data": q1.model_dump(mode="json")}),
            citations=[]
        )
        db.add(msg)
        await db.commit()

        return InterviewTurnResponse(
            conversation_id=str(conv.id),
            evaluation=None,
            next_question=q1,
            final_report=None,
            is_complete=False
        )

    async def process_answer(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
        user_answer: str,
    ) -> InterviewTurnResponse:
        """Evaluate answer, generate next question or final report."""
        if not self.ai:
            raise ValueError("AI provider is not configured.")

        # 1. Fetch conversation
        conv = await db.execute(select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id))
        conv = conv.scalar_one_or_none()
        if not conv:
            raise ValueError("Conversation not found")

        topic = conv.metadata_json.get("topic", "General")
        profile = conv.metadata_json.get("interview_profile", {})

        # 2. Fetch history
        # We need the previous question to evaluate the current answer
        msgs_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation_id)
            .order_by(ChatMessage.created_at)
        )
        history_msgs = msgs_result.scalars().all()

        # The last message from assistant should be the question
        last_assistant_msg = next((m for m in reversed(history_msgs) if m.role == "assistant"), None)
        if not last_assistant_msg:
            raise ValueError("No previous question found.")

        try:
            content_data = json.loads(last_assistant_msg.content)
            if content_data.get("type") == "question":
                last_q_data = content_data["data"]
            elif content_data.get("type") == "turn":
                last_q_data = content_data["next_question"]
            else:
                raise ValueError(f"Unknown message type: {content_data.get('type')}")
            last_question = InterviewQuestion(**last_q_data)
        except Exception as e:
            raise ValueError(f"Failed to parse previous question from history: {e}")

        # Save user answer
        user_msg = ChatMessage(
            conversation_id=conversation_id,
            user_id=user_id,
            role="user",
            content=user_answer,
            citations=[]
        )
        db.add(user_msg)
        await db.flush()

        # Count total user answers in this interview
        turn_count = sum(1 for m in history_msgs if m.role == "user") + 1

        # 3. Evaluate the answer
        eval_sys = (
            "You are a strict, highly accurate technical evaluator. "
            "Evaluate the candidate's exact answer against the exact question asked. "
            "CRITICAL RULES:\n"
            "1. ONLY evaluate based on the candidate's actual answer.\n"
            "2. If the answer is 'I don't know', 'no', or empty, status MUST be 'insufficient' and score 0.\n"
            "3. Do NOT invent things the candidate didn't say.\n"
            "Return a valid JSON object EXACTLY matching this structure:\n"
            '{"status": "correct|mostly_correct|partially_correct|incorrect|insufficient|off_topic", "score": 0, "user_answer": "string", "what_was_correct": ["string"], "what_was_missing": ["string"], "what_was_incorrect": ["string"], "explanation": "string", "ideal_answer": "string", "evidence": ["string"]}'
        )
        eval_prompt = (
            f"Question: {last_question.question}\n"
            f"Expected Topics: {last_question.expected_topics}\n\n"
            f"Candidate's Exact Answer: {user_answer}"
        )
        
        eval_json = await self.ai.generate_json(eval_sys, eval_prompt, max_tokens=1500)
        evaluation = InterviewEvaluation(**eval_json)

        # 4. Generate next question or final report
        if turn_count < 10:
            # Generate next question
            q_sys = (
                "You are an expert technical and behavioral interviewer. "
                "Based on the candidate's profile, interview history, and the evaluation of their last answer, "
                "generate the NEXT question of the interview. "
                "CRITICAL RULES:\n"
                "1. If they failed the last question, you can ask a simpler follow-up or pivot to a new topic.\n"
                "2. If they succeeded, increase difficulty.\n"
                "3. DO NOT repeat previous questions or topics.\n"
                "4. ONLY ask about facts present in their profile.\n"
                "Return a valid JSON object EXACTLY matching this structure:\n"
                '{"question": "string", "category": "string", "difficulty": "string", "basis": ["string"], "expected_topics": ["string"]}'
            )
            
            history_summary = []
            for m in history_msgs:
                if m.role == "assistant":
                    try:
                        q = json.loads(m.content).get("data", {}).get("question", "")
                        if q: history_summary.append(f"Interviewer: {q}")
                    except: pass
                else:
                    history_summary.append(f"Candidate: {m.content}")
            
            profile_text = "\n".join(f"- {k}: {v}" for k, v in profile.items()) if profile else "No specific profile provided."
            q_prompt = (
                f"Topic: {topic}\n"
                f"Candidate Profile Details:\n{profile_text}\n"
                f"History:\n" + "\n".join(history_summary[-6:]) + f"\n"
                f"Last Answer Evaluation: {evaluation.status} (Score {evaluation.score}/10)\n"
            )
            
            next_q_json = await self.ai.generate_json(q_sys, q_prompt, max_tokens=800)
            next_q = InterviewQuestion(**next_q_json)
            
            # Save assistant response
            ast_msg = ChatMessage(
                conversation_id=conversation_id,
                user_id=user_id,
                role="assistant",
                content=json.dumps({
                    "type": "turn", 
                    "evaluation": evaluation.model_dump(mode="json"), 
                    "next_question": next_q.model_dump(mode="json")
                }),
                citations=[]
            )
            db.add(ast_msg)
            await db.commit()
            
            return InterviewTurnResponse(
                conversation_id=str(conversation_id),
                evaluation=evaluation,
                next_question=next_q,
                final_report=None,
                is_complete=False
            )
        else:
            # Generate final report
            rep_sys = (
                "You are an expert technical interviewer summarizing a complete interview. "
                "Review the ENTIRE interview history and generate a structured final report. "
                "CRITICAL RULES:\n"
                "1. DO NOT HALLUCINATE. Base every claim on what the candidate actually said.\n"
                "2. If the candidate answered 'I don't know' to everything, accurately report that they lacked knowledge.\n"
                "Return a valid JSON object EXACTLY matching this structure:\n"
                '{"overall_score": 0, "technical_knowledge": "string", "problem_solving": "string", "communication": "string", "project_understanding": "string", "role_relevance": "string", "strengths": ["string"], "areas_for_improvement": ["string"], "question_by_question": [{"question": "string", "user_answer": "string", "evaluation": "string", "score": 0, "what_was_correct": ["string"], "what_was_missing": ["string"], "what_was_incorrect": ["string"], "ideal_answer": "string"}], "recommended_next_steps": ["string"]}'
            )
            
            # Build full transcript with evaluations if possible, but just transcript is okay
            full_transcript = []
            for m in history_msgs:
                if m.role == "assistant":
                    try:
                        data = json.loads(m.content)
                        if data.get("type") == "question":
                            full_transcript.append(f"Interviewer: {data['data']['question']}")
                        elif data.get("type") == "turn":
                            full_transcript.append(f"Interviewer: {data['next_question']['question']}")
                    except: pass
                else:
                    full_transcript.append(f"Candidate: {m.content}")
            full_transcript.append(f"Candidate: {user_answer}")
            
            rep_prompt = (
                f"Topic: {topic}\n"
                f"Profile: {json.dumps(profile)}\n"
                f"Transcript:\n" + "\n".join(full_transcript)
            )
            
            rep_json = await self.ai.generate_json(rep_sys, rep_prompt, max_tokens=2500)
            report = InterviewFinalReport(**rep_json)
            
            # Save assistant response
            ast_msg = ChatMessage(
                conversation_id=conversation_id,
                user_id=user_id,
                role="assistant",
                content=json.dumps({
                    "type": "report", 
                    "evaluation": evaluation.model_dump(mode="json"), 
                    "final_report": report.model_dump(mode="json")
                }),
                citations=[]
            )
            db.add(ast_msg)
            await db.commit()
            
            return InterviewTurnResponse(
                conversation_id=str(conversation_id),
                evaluation=evaluation,
                next_question=None,
                final_report=report,
                is_complete=True
            )
