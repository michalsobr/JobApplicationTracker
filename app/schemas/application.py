"""
Application request and response schemas.

This module defines the Pydantic models used for validation, API responses,
sorting options, and application statistics.
"""

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


# region Enums


class ApplicationStatus(str, Enum):
    """
    Allowed status values for an application.
    """

    APPLIED = "Applied"
    INTERVIEW = "Interview"
    OFFER = "Offer"
    REJECTED = "Rejected"


class SortField(str, Enum):
    """
    Allowed fields that can be used for sorting application results.
    """

    ID = "id"
    COMPANY_NAME = "company_name"
    JOB_TITLE = "job_title"
    LOCATION = "location"
    STATUS = "status"
    DATE_APPLIED = "date_applied"
    DEADLINE = "deadline"
    CREATED_AT = "created_at"
    UPDATED_AT = "updated_at"


class SortOrder(str, Enum):
    """
    Allowed sort directions for application results.
    """

    ASC = "asc"
    DESC = "desc"


# endregion


# region Shared base schema


class ApplicationBase(BaseModel):
    """
    Shared fields used by application create and response schemas.
    """

    company_name: str = Field(..., min_length=1, max_length=100)
    job_title: str = Field(..., min_length=1, max_length=100)
    status: ApplicationStatus = ApplicationStatus.APPLIED
    date_applied: date
    location: str = Field(..., min_length=1, max_length=100)
    notes: Optional[str] = None
    deadline: Optional[date] = None

    @model_validator(mode="after")
    def validate_dates(self):
        """
        Ensure the deadline is not earlier than the applied date.
        """
        if self.deadline is not None and self.deadline < self.date_applied:
            raise ValueError("Deadline cannot be earlier than date applied.")
        return self


# endregion


# region Request schemas


class ApplicationCreate(ApplicationBase):
    """
    Schema for creating a new application.
    """

    pass


class ApplicationUpdate(BaseModel):
    """
    Schema for partially updating an existing application.
    """

    company_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    job_title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    status: Optional[ApplicationStatus] = None
    date_applied: Optional[date] = None
    location: Optional[str] = Field(default=None, min_length=1, max_length=100)
    notes: Optional[str] = None
    deadline: Optional[date] = None

    @model_validator(mode="after")
    def validate_dates(self):
        """
        Ensure the deadline is not earlier than the applied date
        when both values are provided in the update request.
        """
        if self.deadline is not None and self.date_applied is not None:
            if self.deadline < self.date_applied:
                raise ValueError("Deadline cannot be earlier than date applied.")
        return self


# endregion


# region Response schemas


class ApplicationResponse(ApplicationBase):
    """
    Schema returned for a single application.
    """

    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaginatedApplicationsResponse(BaseModel):
    """
    Schema returned when listing paginated applications.
    """

    total: int
    skip: int
    limit: int
    items: list[ApplicationResponse]


class ApplicationStats(BaseModel):
    """
    Schema returned for dashboard summary statistics.
    """

    total: int
    applied: int
    interview: int
    offer: int
    rejected: int
    active: int
    closed: int
    upcoming_deadlines: int
    overdue_deadlines: int
    response_rate: float
    interview_rate: float
    offer_rate: float
    rejection_rate: float


# endregion
