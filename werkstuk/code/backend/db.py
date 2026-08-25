import os
import time

import httpx
from dotenv import load_dotenv
from supabase import ClientOptions, create_client

load_dotenv()

supabase_url = os.getenv("SUPABASE_URL")
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY")
supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not supabase_url or not supabase_anon_key or not supabase_service_role_key:
    raise RuntimeError(
        "Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in backend .env"
    )

# Windows + httpx sometimes raises WinError 10035 mid-request. That is a
# transient socket glitch, not a bad query. Retry a few times so Learn
# does not show "Failed to fetch" during a demo.
_RETRYABLE = (
    httpx.ReadError,
    httpx.ConnectError,
    httpx.RemoteProtocolError,
    httpx.WriteError,
)


class _RetryTransport(httpx.HTTPTransport):
    def handle_request(self, request):
        last_error = None
        for attempt in range(3):
            try:
                return super().handle_request(request)
            except _RETRYABLE as error:
                last_error = error
                if attempt == 2:
                    break
                time.sleep(0.2 * (attempt + 1))
        raise last_error


def _client_options():
    return ClientOptions(
        httpx_client=httpx.Client(
            transport=_RetryTransport(),
            timeout=120.0,
            follow_redirects=True,
        )
    )


# anon client: only used to verify user JWTs
supabase = create_client(supabase_url, supabase_anon_key, options=_client_options())
# service-role client: all table access (bypasses RLS, never exposed to browser)
db = create_client(supabase_url, supabase_service_role_key, options=_client_options())
