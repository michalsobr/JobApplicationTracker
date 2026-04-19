"""
FastAPI application entry point.

This module creates the FastAPI app, configures middleware, creates database
tables, and registers API routes.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import applications
from app.core.database import Base, engine
from app.models.application import Application

# region App setup

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Job Application Tracker API")

# endregion


# region Middleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development setup only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# endregion


# region Routes

app.include_router(applications.router)


@app.get("/")
def root():
    """
    Basic health-check route for confirming that the API is running.
    """
    return {"message": "Job Application Tracker API is running"}


# endregion
