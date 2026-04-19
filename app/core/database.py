"""
Database configuration.

This module configures the SQLAlchemy engine, session factory, base model,
and request-scoped database session dependency.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

# region Database setup

DATABASE_URL = "sqlite:///./job_applications.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()

# endregion


# region Dependency


def get_db():
    """
    Provide a database session for each request and close it afterwards.
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# endregion
