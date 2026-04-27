import json
import logging

from groq import AsyncGroq
from groq.types.chat.completion_create_params import ResponseFormatResponseFormatJsonSchema

from app.core.config import settings
from app.schemas.api import (
    SENTIMENT_PROMPT_HEADER,
    SENTIMENT_PROMPT_FOOTER,
    PRIORITY_PROMPT_HEADER,
    PRIORITY_PROMPT_FOOTER,
    REPLY_PROMPT_HEADER,
    REPLY_PROMPT_FOOTER,
)

logger = logging.getLogger(__name__)

# Module-level async client — reads GROQ_API_KEY from env automatically.
# Built-in retries: 3 attempts with exponential backoff (covers connection errors,
# 408, 409, 429, and 5xx).
client = AsyncGroq(
    api_key=settings.groq_api_key,
    max_retries=3,
)

# --- Strict-mode JSON schemas (supported by openai/gpt-oss-20b) ---

SENTIMENT_JSON_SCHEMA = ResponseFormatResponseFormatJsonSchema(
    type="json_schema",
    json_schema={
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
)

PRIORITY_JSON_SCHEMA = ResponseFormatResponseFormatJsonSchema(
    type="json_schema",
    json_schema={
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
)


async def analyze_sentiment(
    content: str,
    instructions: str = "",
) -> str:
    """Classify review sentiment. Returns 'positive', 'neutral', or 'negative'.

    Args:
        content: The review comment text — nothing else.
        instructions: Optional extra instructions from the frontend.
    """
    parts = [SENTIMENT_PROMPT_HEADER]
    if instructions:
        parts.append(instructions)
    parts.append(SENTIMENT_PROMPT_FOOTER.format(content=content))
    user_message = "\n\n".join(parts)

    logger.info(
        "Groq sentiment REQUEST  model=%s  messages=%s",
        settings.groq_model,
        [{"role": "user", "content": user_message}],
    )

    response = await client.chat.completions.create(
        model=settings.groq_model,
        messages=[{"role": "user", "content": user_message}],
        temperature=0,
        max_tokens=10000,
        response_format=SENTIMENT_JSON_SCHEMA,
    )

    raw = response.choices[0].message.content or "{}"
    logger.info(
        "Groq sentiment RESPONSE  id=%s  model=%s  raw=%s  usage=%s  finish_reason=%s",
        response.id,
        response.model,
        raw,
        response.usage,
        response.choices[0].finish_reason,
    )
    result = json.loads(raw)
    sentiment = result.get("sentiment", "neutral")
    if sentiment not in ("positive", "neutral", "negative"):
        logger.warning("Unexpected sentiment value: %s – defaulting to neutral", sentiment)
        sentiment = "neutral"
    return sentiment


async def analyze_priority(
    content: str,
    instructions: str = "",
) -> str:
    """Classify review priority. Returns 'high', 'medium', or 'low'.

    Args:
        content: The review comment text — nothing else.
        instructions: Optional extra instructions from the frontend.
    """
    parts = [PRIORITY_PROMPT_HEADER]
    if instructions:
        parts.append(instructions)
    parts.append(PRIORITY_PROMPT_FOOTER.format(content=content))
    user_message = "\n\n".join(parts)

    logger.info(
        "Groq priority REQUEST  model=%s  messages=%s",
        settings.groq_model,
        [{"role": "user", "content": user_message}],
    )

    response = await client.chat.completions.create(
        model=settings.groq_model,
        messages=[{"role": "user", "content": user_message}],
        temperature=0,
        max_tokens=10000,
        response_format=PRIORITY_JSON_SCHEMA,
    )

    raw = response.choices[0].message.content or "{}"
    logger.info(
        "Groq priority RESPONSE  id=%s  model=%s  raw=%s  usage=%s  finish_reason=%s",
        response.id,
        response.model,
        raw,
        response.usage,
        response.choices[0].finish_reason,
    )
    result = json.loads(raw)
    priority = result.get("priority", "low")
    if priority not in ("high", "medium", "low"):
        logger.warning("Unexpected priority value: %s – defaulting to low", priority)
        priority = "low"
    return priority


REPLY_JSON_SCHEMA = ResponseFormatResponseFormatJsonSchema(
    type="json_schema",
    json_schema={
        "name": "reply",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "reply": {
                    "type": "string",
                }
            },
            "required": ["reply"],
            "additionalProperties": False,
        },
    },
)


async def generate_reply(
    user_name: str,
    content: str,
    instructions: str = "",
) -> str:
    """Generate a developer reply to a review. Returns the reply text.

    Args:
        user_name: Name of the reviewer.
        content: The review text.
        instructions: Optional extra instructions from the frontend.
    """
    parts = [REPLY_PROMPT_HEADER]
    if instructions:
        parts.append(instructions)
    parts.append(REPLY_PROMPT_FOOTER.format(user_name=user_name, content=content))
    user_message = "\n\n".join(parts)

    logger.info(
        "Groq reply REQUEST  model=%s  user_name=%s",
        settings.groq_model,
        user_name,
    )

    response = await client.chat.completions.create(
        model=settings.groq_model,
        messages=[{"role": "user", "content": user_message}],
        temperature=0.7,
        max_tokens=10000,
        response_format=REPLY_JSON_SCHEMA,
    )

    raw = response.choices[0].message.content or "{}"
    logger.info(
        "Groq reply RESPONSE  id=%s  model=%s  raw=%s  usage=%s  finish_reason=%s",
        response.id,
        response.model,
        raw,
        response.usage,
        response.choices[0].finish_reason,
    )
    result = json.loads(raw)
    return result.get("reply", "")
