"""
Application service layer.

This module acts as a thin layer between the API routes and CRUD functions.
It keeps route handlers clean and centralises business-flow calls in one place.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.crud.application import (
    create_application,
    create_applications_bulk,
    delete_application,
    export_applications_to_csv,
    get_all_locations,
    get_application_by_id,
    get_application_stats,
    get_applications,
    get_overdue_applications,
    get_upcoming_deadline_applications,
    update_application,
)
from app.schemas.application import ApplicationCreate, ApplicationUpdate


# region Create operations


def create_new_application(db: Session, application_data: ApplicationCreate):
    """
    Create a single application.
    """
    return create_application(db, application_data)


def create_multiple_applications(
    db: Session,
    applications_data: list[ApplicationCreate],
):
    """
    Create multiple applications in one call.
    """
    return create_applications_bulk(db, applications_data)


# endregion


# region Read operations


def get_all_applications(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    locations: Optional[list[str]] = None,
    sort_by: str = "date_applied",
    order: str = "desc",
    skip: int = 0,
    limit: int = 10,
):
    """
    Return paginated applications with optional filters and sorting.
    """
    return get_applications(
        db,
        status,
        search,
        locations,
        sort_by,
        order,
        skip,
        limit,
    )


def get_single_application(db: Session, application_id: int):
    """
    Return one application by ID.
    """
    return get_application_by_id(db, application_id)


def get_locations(db: Session):
    """
    Return all unique application locations.
    """
    return get_all_locations(db)


def get_upcoming_deadlines(db: Session, days: int = 7):
    """
    Return applications with deadlines due soon.
    """
    return get_upcoming_deadline_applications(db, days)


def get_overdue_deadlines(db: Session):
    """
    Return applications with overdue deadlines.
    """
    return get_overdue_applications(db)


def get_stats(db: Session):
    """
    Return summary statistics for the dashboard.
    """
    return get_application_stats(db)


def export_csv(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    locations: Optional[list[str]] = None,
    sort_by: str = "date_applied",
    order: str = "desc",
):
    """
    Export applications to CSV using the current filter and sorting options.
    """
    return export_applications_to_csv(
        db,
        status,
        search,
        locations,
        sort_by,
        order,
    )


# endregion


# region Update and delete operations


def update_existing_application(
    db: Session,
    application_id: int,
    application_data: ApplicationUpdate,
):
    """
    Update one application if it exists.
    """
    db_application = get_application_by_id(db, application_id)

    if not db_application:
        return None

    return update_application(db, db_application, application_data)


def delete_existing_application(db: Session, application_id: int):
    """
    Delete one application if it exists.
    """
    db_application = get_application_by_id(db, application_id)

    if not db_application:
        return False

    delete_application(db, db_application)
    return True


# endregion
