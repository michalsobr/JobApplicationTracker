"""
Application database model.

This module defines the SQLAlchemy model for a stored job application record.
"""

from sqlalchemy import Column, Date, DateTime, Integer, String, Text
from sqlalchemy.sql import func

from app.core.database import Base


# region Models


class Application(Base):
    """
    Database model representing one job application entry.
    """

    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    company_name = Column(String, nullable=False)
    job_title = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Applied")
    date_applied = Column(Date, nullable=False)
    location = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    deadline = Column(Date, nullable=True)

    # Automatically set when the record is first created.
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    # Automatically updated whenever the record changes.
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# endregion
