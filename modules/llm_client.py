"""
LLM Client - Azure OpenAI wrapper using DefaultAzureCredential (keyless auth).

All pipeline jobs (translation, deduplication, analyst voice) route through a
single Azure OpenAI deployment. Per-job differences are limited to token budget;
temperature is left at the deployment default since GPT-5 family deployments
reject non-default temperature values.

Auth: requires `az login` to have been run. Uses Microsoft Entra ID bearer
tokens via DefaultAzureCredential - no API keys.
"""

import os
import logging
from typing import Optional

from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from openai import AzureOpenAI

logger = logging.getLogger(__name__)

_cached_client: Optional[AzureOpenAI] = None


def _get_client() -> AzureOpenAI:
    """Return a cached AzureOpenAI client using DefaultAzureCredential."""
    global _cached_client
    if _cached_client is None:
        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
        api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
        token_scope = os.environ.get(
            "AZURE_OPENAI_TOKEN_SCOPE", "https://ai.azure.com/.default"
        )
        if not endpoint:
            raise RuntimeError(
                "Missing AZURE_OPENAI_ENDPOINT. Set it in .env."
            )
        # process_timeout is bumped to 30s: on Windows the `az` subprocess that
        # AzureCliCredential spawns can exceed the 10s default on a cold start,
        # which surfaced as intermittent CredentialUnavailableError failures.
        token_provider = get_bearer_token_provider(
            DefaultAzureCredential(process_timeout=30),
            token_scope,
        )
        _cached_client = AzureOpenAI(
            azure_endpoint=endpoint,
            azure_ad_token_provider=token_provider,
            api_version=api_version,
        )
    return _cached_client


class LLMClient:
    """Azure OpenAI chat completion client wrapping a single deployment."""

    def __init__(self, deployment: str, max_tokens: int = 4000, timeout: int = 120):
        self.deployment = deployment
        self.max_tokens = max_tokens
        self.timeout = timeout

    def complete(self, system_prompt: str, user_prompt: str) -> str:
        """Send a chat completion request and return the response text."""
        client = _get_client()
        response = client.chat.completions.create(
            model=self.deployment,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_completion_tokens=self.max_tokens,
            timeout=self.timeout,
        )
        return response.choices[0].message.content or ""


def build_client_from_config(model_config: dict) -> LLMClient:
    """Factory: build an LLMClient from a config.yaml model section."""
    deployment = model_config.get("deployment") or os.environ.get(
        "AZURE_OPENAI_DEPLOYMENT"
    )
    if not deployment:
        raise RuntimeError(
            "Missing deployment. Set AZURE_OPENAI_DEPLOYMENT in .env "
            "or 'deployment' in config.yaml."
        )

    return LLMClient(
        deployment=deployment,
        max_tokens=model_config.get("max_tokens", 4000),
    )
