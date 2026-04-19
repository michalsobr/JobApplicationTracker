"""
Application CRUD operations.

This module contains all direct database operations for job applications,
including create, read, update, delete, statistics, location retrieval,
deadline queries, and CSV export.
"""

import csv
import io
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.application import Application
from app.schemas.application import ApplicationCreate, ApplicationUpdate


# region Create operations


def create_application(db: Session, application_data: ApplicationCreate) -> Application:
    """
    Create a single job application record in the database.
    """
    db_application = Application(**application_data.model_dump())
    db.add(db_application)
    db.commit()
    db.refresh(db_application)
    return db_application


def create_applications_bulk(
    db: Session,
    applications_data: list[ApplicationCreate],
) -> list[Application]:
    """
    Create multiple job application records in the database.
    """
    db_applications = [
        Application(**application_data.model_dump())
        for application_data in applications_data
    ]

    db.add_all(db_applications)
    db.commit()

    for application in db_applications:
        db.refresh(application)

    return db_applications


# endregion


# region Read operations


def get_applications(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    locations: Optional[list[str]] = None,
    sort_by: str = "date_applied",
    order: str = "desc",
    skip: int = 0,
    limit: int = 10,
) -> tuple[int, list[Application]]:
    """
    Return job applications with optional filtering, sorting, and pagination.
    """
    query = db.query(Application)

    if status:
        query = query.filter(Application.status == status)

    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Application.company_name.ilike(search_term),
                Application.job_title.ilike(search_term),
            )
        )

    if locations:
        normalized_locations = [location.strip().lower() for location in locations]
        query = query.filter(func.lower(Application.location).in_(normalized_locations))

    total = query.count()

    sort_column_map = {
        "id": Application.id,
        "company_name": Application.company_name,
        "job_title": Application.job_title,
        "location": Application.location,
        "status": Application.status,
        "date_applied": Application.date_applied,
        "deadline": Application.deadline,
        "created_at": Application.created_at,
        "updated_at": Application.updated_at,
    }

    sort_column = sort_column_map.get(sort_by, Application.date_applied)

    if order.lower() == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    items = query.offset(skip).limit(limit).all()
    return total, items


def get_application_by_id(db: Session, application_id: int) -> Optional[Application]:
    """
    Return one application by its ID, or None if it does not exist.
    """
    return db.query(Application).filter(Application.id == application_id).first()


def get_all_locations(db: Session) -> list[str]:
    """
    Return all unique application locations, normalised case-insensitively.
    """
    raw_locations = (
        db.query(Application.location).filter(Application.location.is_not(None)).all()
    )

    normalized_map = {}

    for (location,) in raw_locations:
        cleaned_location = location.strip()

        if not cleaned_location:
            continue

        normalized_value = cleaned_location.lower()
        formatted_label = " ".join(
            word.capitalize() for word in normalized_value.split()
        )

        normalized_map[normalized_value] = formatted_label

    return sorted(normalized_map.values())


def get_upcoming_deadline_applications(
    db: Session,
    days: int = 7,
) -> list[Application]:
    """
    Return applications with deadlines in the next given number of days.
    """
    today = date.today()
    future_date = today + timedelta(days=days)

    return (
        db.query(Application)
        .filter(
            Application.deadline.is_not(None),
            Application.deadline >= today,
            Application.deadline <= future_date,
        )
        .order_by(Application.deadline.asc())
        .all()
    )


def get_overdue_applications(db: Session) -> list[Application]:
    """
    Return applications with deadlines that have already passed.
    """
    today = date.today()

    return (
        db.query(Application)
        .filter(
            Application.deadline.is_not(None),
            Application.deadline < today,
        )
        .order_by(Application.deadline.asc())
        .all()
    )


def get_application_stats(db: Session) -> dict:
    """
    Return dashboard summary statistics for applications.
    """
    total = db.query(func.count(Application.id)).scalar() or 0

    applied = (
        db.query(func.count(Application.id))
        .filter(Application.status == "Applied")
        .scalar()
        or 0
    )

    interview = (
        db.query(func.count(Application.id))
        .filter(Application.status == "Interview")
        .scalar()
        or 0
    )

    offer = (
        db.query(func.count(Application.id))
        .filter(Application.status == "Offer")
        .scalar()
        or 0
    )

    rejected = (
        db.query(func.count(Application.id))
        .filter(Application.status == "Rejected")
        .scalar()
        or 0
    )

    active = applied + interview
    closed = offer + rejected

    today = date.today()
    next_week = today + timedelta(days=7)

    upcoming_deadlines = (
        db.query(func.count(Application.id))
        .filter(
            Application.deadline.is_not(None),
            Application.deadline >= today,
            Application.deadline <= next_week,
        )
        .scalar()
        or 0
    )

    overdue_deadlines = (
        db.query(func.count(Application.id))
        .filter(
            Application.deadline.is_not(None),
            Application.deadline < today,
        )
        .scalar()
        or 0
    )

    if total > 0:
        response_rate = ((interview + offer) / total) * 100
        interview_rate = (interview / total) * 100
        offer_rate = (offer / total) * 100
        rejection_rate = (rejected / total) * 100
    else:
        response_rate = 0.0
        interview_rate = 0.0
        offer_rate = 0.0
        rejection_rate = 0.0

    return {
        "total": total,
        "applied": applied,
        "interview": interview,
        "offer": offer,
        "rejected": rejected,
        "active": active,
        "closed": closed,
        "upcoming_deadlines": upcoming_deadlines,
        "overdue_deadlines": overdue_deadlines,
        "response_rate": round(response_rate, 2),
        "interview_rate": round(interview_rate, 2),
        "offer_rate": round(offer_rate, 2),
        "rejection_rate": round(rejection_rate, 2),
    }


def export_applications_to_csv(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    locations: Optional[list[str]] = None,
    sort_by: str = "date_applied",
    order: str = "desc",
) -> str:
    """
    Export applications to CSV and return the CSV content as a string.
    """
    _, applications = get_applications(
        db=db,
        status=status,
        search=search,
        locations=locations,
        sort_by=sort_by,
        order=order,
        skip=0,
        limit=100000,
    )

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(
        [
            "id",
            "company_name",
            "job_title",
            "status",
            "date_applied",
            "location",
            "notes",
            "deadline",
            "created_at",
            "updated_at",
        ]
    )

    for application in applications:
        writer.writerow(
            [
                application.id,
                application.company_name,
                application.job_title,
                application.status,
                application.date_applied,
                application.location,
                application.notes,
                application.deadline,
                application.created_at,
                application.updated_at,
            ]
        )

    return output.getvalue()


# endregion


# region Update and delete operations


def update_application(
    db: Session,
    db_application: Application,
    application_data: ApplicationUpdate,
) -> Application:
    """
    Update an existing application using only the fields provided in the request.
    """
    update_data = application_data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(db_application, field, value)

    db.commit()
    db.refresh(db_application)
    return db_application


def delete_application(db: Session, db_application: Application) -> None:
    """
    Delete an existing application from the database.
    """
    db.delete(db_application)
    db.commit()


# endregion
