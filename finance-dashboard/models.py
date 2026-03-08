from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class TLConnection(Base):
    """Persistent storage for TrueLayer OAuth connections.
    Survives Render redeploys (ephemeral filesystem would lose a flat JSON file)."""
    __tablename__ = "tl_connections"

    id         = Column(String, primary_key=True)   # connection uuid
    data       = Column(Text, nullable=False)        # full JSON blob
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())