import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.schemas.interview import InterviewStartRequest, InterviewAnswerRequest, InterviewTurnResponse
from app.services.interview_service import InterviewService

router = APIRouter(prefix="/interview", tags=["interview"])
service = InterviewService()

@router.post("/start", response_model=InterviewTurnResponse)
async def start_interview(
    payload: InterviewStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Initialize a new mock interview. Extracts profile, generates Q1.
    """
    return await service.start_interview(db, current_user.id, payload.topic, payload.source_types)


@router.post("/{conversation_id}/answer", response_model=InterviewTurnResponse)
async def process_answer(
    conversation_id: uuid.UUID,
    payload: InterviewAnswerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Process the candidate's answer, evaluate it, and generate either the next question or final report.
    """
    return await service.process_answer(db, current_user.id, conversation_id, payload.answer)
