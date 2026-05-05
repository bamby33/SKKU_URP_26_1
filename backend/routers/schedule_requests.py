"""보호자 → 당사자 일과 변경 요청 API"""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from models.database import get_db, ScheduleChangeRequest, Schedule
from datetime import datetime

router = APIRouter(prefix="/schedule-requests", tags=["schedule-requests"])


class ScheduleAddItem(BaseModel):
    title: str
    scheduled_time: str
    days_of_week: str


class ChangeRequestCreate(BaseModel):
    change_type: str          # "today" | "week"
    schedules_to_delete: list[int] = []
    schedules_to_add: list[ScheduleAddItem] = []


@router.post("/user/{user_id}")
def create_request(user_id: int, body: ChangeRequestCreate, db: Session = Depends(get_db)):
    """보호자가 일과 변경을 요청"""
    # 기존 pending 요청이 있으면 덮어쓰기 (중복 방지)
    existing = db.query(ScheduleChangeRequest).filter(
        ScheduleChangeRequest.user_id == user_id,
        ScheduleChangeRequest.status == "pending",
        ScheduleChangeRequest.change_type == body.change_type,
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    req = ScheduleChangeRequest(
        user_id=user_id,
        change_type=body.change_type,
        payload=json.dumps({
            "schedules_to_delete": body.schedules_to_delete,
            "schedules_to_add": [s.dict() for s in body.schedules_to_add],
        }, ensure_ascii=False),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"id": req.id, "status": req.status}


@router.get("/user/{user_id}/pending")
def get_pending(user_id: int, db: Session = Depends(get_db)):
    """당사자: 보류 중인 변경 요청 목록"""
    reqs = db.query(ScheduleChangeRequest).filter(
        ScheduleChangeRequest.user_id == user_id,
        ScheduleChangeRequest.status == "pending",
    ).order_by(ScheduleChangeRequest.created_at.desc()).all()

    result = []
    for r in reqs:
        payload = json.loads(r.payload)
        result.append({
            "id": r.id,
            "change_type": r.change_type,
            "schedules_to_delete_count": len(payload.get("schedules_to_delete", [])),
            "schedules_to_add_count": len(payload.get("schedules_to_add", [])),
            "schedules_to_add": payload.get("schedules_to_add", []),
            "created_at": r.created_at.isoformat(),
        })
    return result


@router.put("/{req_id}/accept")
def accept_request(req_id: int, db: Session = Depends(get_db)):
    """당사자: 변경 수락 → 스케줄 실제 적용"""
    req = db.query(ScheduleChangeRequest).filter(ScheduleChangeRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="요청을 찾을 수 없어요.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리된 요청이에요.")

    payload = json.loads(req.payload)

    # 삭제 대상 스케줄 삭제
    for sid in payload.get("schedules_to_delete", []):
        s = db.query(Schedule).filter(Schedule.id == sid).first()
        if s:
            db.delete(s)

    # 새 스케줄 추가
    for item in payload.get("schedules_to_add", []):
        db.add(Schedule(
            user_id=req.user_id,
            title=item["title"],
            scheduled_time=item["scheduled_time"],
            days_of_week=item["days_of_week"],
        ))

    req.status = "accepted"
    db.commit()
    return {"success": True}


@router.put("/{req_id}/reject")
def reject_request(req_id: int, db: Session = Depends(get_db)):
    """당사자: 변경 거절"""
    req = db.query(ScheduleChangeRequest).filter(ScheduleChangeRequest.id == req_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="요청을 찾을 수 없어요.")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리된 요청이에요.")
    req.status = "rejected"
    db.commit()
    return {"success": True}
