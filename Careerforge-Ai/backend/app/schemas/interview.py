from typing import Any, Literal
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Core Structured Models (used for LLM JSON generation)
# ---------------------------------------------------------------------------

class InterviewProfile(BaseModel):
    """The context extracted before the interview starts."""
    target_role: str = ""
    experience_level: str = ""
    skills: list[str] = []
    projects: list[str] = []
    education: list[str] = []
    experience: list[str] = []
    missing_information: list[str] = []

class InterviewQuestion(BaseModel):
    """A generated interview question."""
    question: str
    category: str
    difficulty: str
    basis: list[str] = Field(description="List of facts from the candidate's profile used as the basis for this question.")
    expected_topics: list[str] = Field(description="Key topics the candidate should mention in their answer.")

class InterviewEvaluation(BaseModel):
    """Evaluation of a specific answer."""
    status: Literal["correct", "mostly_correct", "partially_correct", "incorrect", "insufficient", "off_topic"]
    score: int = Field(ge=0, le=10)
    user_answer: str
    what_was_correct: list[str]
    what_was_missing: list[str]
    what_was_incorrect: list[str]
    explanation: str
    ideal_answer: str
    evidence: list[str] = Field(description="Direct quotes or references from the user's answer supporting the evaluation.")

class QuestionByQuestionEval(BaseModel):
    question: str
    user_answer: str
    evaluation: str
    score: int
    what_was_correct: list[str]
    what_was_missing: list[str]
    what_was_incorrect: list[str]
    ideal_answer: str

class InterviewFinalReport(BaseModel):
    """The final assessment report."""
    overall_score: int
    technical_knowledge: str
    problem_solving: str
    communication: str
    project_understanding: str
    role_relevance: str
    strengths: list[str]
    areas_for_improvement: list[str]
    question_by_question: list[QuestionByQuestionEval]
    recommended_next_steps: list[str]

# ---------------------------------------------------------------------------
# API Request / Response Models
# ---------------------------------------------------------------------------

class InterviewStartRequest(BaseModel):
    topic: str
    source_types: list[str] | None = None

class InterviewAnswerRequest(BaseModel):
    answer: str

class InterviewTurnResponse(BaseModel):
    """Returned after a user submits an answer."""
    conversation_id: str | None = None
    evaluation: InterviewEvaluation | None = None
    next_question: InterviewQuestion | None = None
    final_report: InterviewFinalReport | None = None
    is_complete: bool = False
