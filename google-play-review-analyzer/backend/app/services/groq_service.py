import json

import httpx
from tenacity import (
    retry,
    wait_exponential,
    stop_after_attempt,
    retry_if_exception_type,
)

from app.core.config import settings
from app.schemas.api import (
    SENTIMENT_PROMPT_HEADER,
    SENTIMENT_PROMPT_FOOTER,
    PRIORITY_PROMPT_HEADER,
    PRIORITY_PROMPT_FOOTER,
)

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

SENTIMENT_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "sentiment",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "sentiment": {
                    "type": "string",
                    "enum": ["positive", "neutral", "negative"],
                }
            },
            "required": ["sentiment"],
            "additionalProperties": False,
        },
    },
}

PRIORITY_JSON_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "priority",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "priority": {
                    "type": "string",
                    "enum": ["high", "medium", "low"],
                }
            },
            "required": ["priority"],
            "additionalProperties": False,
        },
    },
}


@retry(
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.ConnectError)),
)
async def analyze_sentiment(
    client: httpx.AsyncClient,
    content: str,
    instructions: str = "",
) -> str:
    """Classify review sentiment. Returns 'positive', 'neutral', or 'negative'.

    Args:
        client: Shared httpx async client for connection pooling.
        content: The review comment text — nothing else.
        instructions: Optional extra instructions from the frontend.
    """
    parts = [SENTIMENT_PROMPT_HEADER]
    if instructions:
        parts.append(instructions)
    parts.append(SENTIMENT_PROMPT_FOOTER.format(content=content))
    user_message = "\n\n".join(parts)

    response = await client.post(
        GROQ_CHAT_URL,
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={
            "model": settings.groq_model,
            "messages": [{"role": "user", "content": user_message}],
            "temperature": 0,
            "max_tokens": 50,
            "response_format": SENTIMENT_JSON_SCHEMA,
        },
    )
    response.raise_for_status()

    raw = response.json()["choices"][0]["message"]["content"]
    result = json.loads(raw)
    return result["sentiment"]


@retry(
    wait=wait_exponential(multiplier=1, min=1, max=10),
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((httpx.HTTPStatusError, httpx.ConnectError)),
)
async def analyze_priority(
    client: httpx.AsyncClient,
    content: str,
    instructions: str = "",
) -> str:
    """Classify review priority. Returns 'high', 'medium', or 'low'.

    Args:
        client: Shared httpx async client for connection pooling.
        content: The review comment text — nothing else.
        instructions: Optional extra instructions from the frontend.
    """
    parts = [PRIORITY_PROMPT_HEADER]
    if instructions:
        parts.append(instructions)
    parts.append(PRIORITY_PROMPT_FOOTER.format(content=content))
    user_message = "\n\n".join(parts)

    response = await client.post(
        GROQ_CHAT_URL,
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={
            "model": settings.groq_model,
            "messages": [{"role": "user", "content": user_message}],
            "temperature": 0,
            "max_tokens": 50,
            "response_format": PRIORITY_JSON_SCHEMA,
        },
    )
    response.raise_for_status()

    raw = response.json()["choices"][0]["message"]["content"]
    result = json.loads(raw)
    return result["priority"]
