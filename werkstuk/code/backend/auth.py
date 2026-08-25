from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from supabase_auth.errors import AuthApiError

from db import supabase

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
):
    token = credentials.credentials
    try:
        result = supabase.auth.get_user(token)
    except AuthApiError:
        # Supabase inspected the token and rejected it (expired or fake).
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception:
        # Supabase itself was unreachable. Not the student's fault, so do
        # not tell them their login is wrong.
        raise HTTPException(status_code=503, detail="Auth service unavailable")

    user = result.user
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid token")

    return user


def is_admin(user) -> bool:
    """True only when Auth app_metadata.role is admin.

    That field is set in the database / Auth dashboard, never by this API.
    user_metadata is ignored because students can edit it.
    """
    meta = getattr(user, "app_metadata", None)
    if not isinstance(meta, dict):
        return False
    return meta.get("role") == "admin"


def require_admin(user=Depends(get_current_user)):
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    return user
