"""
Application API routes.

This module defines the FastAPI endpoints for creating, reading, updating,
deleting, exporting, and summarising job applications.
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.application import (
    ApplicationCreate,
    ApplicationResponse,
    ApplicationStats,
    ApplicationStatus,
    ApplicationUpdate,
    PaginatedApplicationsResponse,
    SortField,
    SortOrder,
)
from app.services.application_service import (
    create_multiple_applications,
    create_new_application,
    delete_existing_application,
    export_csv,
    get_all_applications,
    get_locations,
    get_overdue_deadlines,
    get_single_application,
    get_stats,
    get_upcoming_deadlines,
    update_existing_application,
)

# region Router setup

router = APIRouter(prefix="/applications", tags=["Applications"])
DbSession = Annotated[Session, Depends(get_db)]

# endregion


# region Core collection routes


@router.post(
    "/",
    response_model=ApplicationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_application(application: ApplicationCreate, db: DbSession):
    """
    Create a single job application.
    """
    return create_new_application(db, application)


@router.get("/", response_model=PaginatedApplicationsResponse)
def read_applications(
    db: DbSession,
    status_filter: Optional[ApplicationStatus] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None, min_length=1),
    locations: Optional[list[str]] = Query(default=None, alias="location"),
    sort_by: SortField = Query(default=SortField.DATE_APPLIED),
    order: SortOrder = Query(default=SortOrder.DESC),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
):
    """
    Return a paginated list of applications with optional filtering and sorting.
    """
    total, items = get_all_applications(
        db=db,
        status=status_filter.value if status_filter else None,
        search=search,
        locations=locations,
        sort_by=sort_by.value,
        order=order.value,
        skip=skip,
        limit=limit,
    )

    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "items": items,
    }


@router.post(
    "/bulk",
    response_model=list[ApplicationResponse],
    status_code=status.HTTP_201_CREATED,
)
def create_applications_bulk(applications: list[ApplicationCreate], db: DbSession):
    """
    Create multiple job applications in a single request.
    """
    return create_multiple_applications(db, applications)


# endregion


# region Supporting read routes


@router.get("/locations", response_model=list[str])
def read_locations(db: DbSession):
    """
    Return all unique locations for the location filter dropdown.
    """
    return get_locations(db)


@router.get("/deadlines/upcoming", response_model=list[ApplicationResponse])
def read_upcoming_deadlines(
    db: DbSession,
    days: int = Query(default=7, ge=1, le=365),
):
    """
    Return applications with deadlines due within the next given number of days.
    """
    return get_upcoming_deadlines(db, days)


@router.get("/deadlines/overdue", response_model=list[ApplicationResponse])
def read_overdue_deadlines(db: DbSession):
    """
    Return applications whose deadlines have already passed.
    """
    return get_overdue_deadlines(db)


@router.get("/stats", response_model=ApplicationStats)
def read_application_stats(db: DbSession):
    """
    Return dashboard summary statistics for all applications.
    """
    return get_stats(db)


@router.get("/export/csv")
def export_applications_csv(
    db: DbSession,
    status_filter: Optional[ApplicationStatus] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None, min_length=1),
    locations: Optional[list[str]] = Query(default=None, alias="location"),
    sort_by: SortField = Query(default=SortField.DATE_APPLIED),
    order: SortOrder = Query(default=SortOrder.DESC),
):
    """
    Export the currently filtered application set as a CSV file.
    """
    csv_content = export_csv(
        db=db,
        status=status_filter.value if status_filter else None,
        search=search,
        locations=locations,
        sort_by=sort_by.value,
        order=order.value,
    )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=applications.csv"},
    )


# endregion


# region Single-application routes


@router.get("/{application_id}", response_model=ApplicationResponse)
def read_application(application_id: int, db: DbSession):
    """
    Return one application by ID.
    """
    application = get_single_application(db, application_id)

    if not application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )

    return application


@router.put("/{application_id}", response_model=ApplicationResponse)
def update_application(
    application_id: int,
    application: ApplicationUpdate,
    db: DbSession,
):
    """
    Update one existing application by ID.
    """
    updated_application = update_existing_application(db, application_id, application)

    if not updated_application:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )

    return updated_application


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_application(application_id: int, db: DbSession):
    """
    Delete one application by ID.
    """
    was_deleted = delete_existing_application(db, application_id)

    if not was_deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Application not found",
        )

    return None


# endregion
