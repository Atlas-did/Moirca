"""
LLM客户端封装（继承自MiroFish，保留OpenAI统一格式调用）
"""
import json
import re
from typing import Any, Dict, Iterator, List, Optional

from openai import OpenAI

from ..config import Config


class LLMClient:
    """LLM客户端，支持主模型（复杂推理）+ 本地模型（简单查询）"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        use_local: bool = False,
    ):
        if use_local:
            self.api_key = "ollama"
            self.base_url = base_url or Config.LOCAL_LLM_BASE_URL
            self.model = model or Config.LOCAL_LLM_MODEL_NAME
        else:
            self.api_key = api_key or Config.LLM_API_KEY
            self.base_url = base_url or Config.LLM_BASE_URL
            self.model = model or Config.LLM_MODEL_NAME

        if not self.api_key and not use_local:
            raise ValueError("LLM_API_KEY 未配置")

        self.client = OpenAI(api_key=self.api_key, base_url=self.base_url)

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        content = response.choices[0].message.content
        if not content:
            return ""
        content = re.sub(r'<think>[\s\S]*?</think>', '', content).strip()
        return content

    def chat_stream(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> Iterator[str]:
        """真实流式调用（stream=True），逐 token yield 文本增量。

        只透出与 chat() 一致的「模型输出内容」，过滤 reasoning/think 片段。
        """
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        for chunk in response:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta or {}
            content = getattr(delta, "content", None)
            if not content:
                continue
            yield content

    def chat_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> Dict[str, Any]:
        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content
        if not raw:
            raise ValueError("LLM 返回了空内容，无法解析为 JSON")
        raw = raw.strip()
        raw = re.sub(r'<think>[\s\S]*?</think>', '', raw).strip()
        raw = re.sub(r'^```(?:json)?\s*\n?', '', raw, flags=re.IGNORECASE)
        raw = re.sub(r'\n?```\s*$', '', raw).strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            raise ValueError(f"LLM返回的JSON格式无效: {raw}")
