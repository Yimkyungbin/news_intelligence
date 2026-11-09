// detectLanguage 단위 테스트 (Node 내장 테스트 러너)
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectLanguage } from "../../src/lib/language.ts";

test("한국어 문장은 ko", () => {
  assert.equal(detectLanguage("에이전트 오케스트레이션 실무 가이드"), "ko");
});

test("영어 문장은 en", () => {
  assert.equal(detectLanguage("Agent orchestration field guide"), "en");
});

test("영문 기술 용어가 섞인 한국어는 ko", () => {
  assert.equal(detectLanguage("RAG 파이프라인 구축 사례"), "ko");
});

test("영어 위주에 한국어 한 단어는 en", () => {
  assert.equal(detectLanguage("LLMOps evaluation with LangSmith 소개"), "en");
});

test("빈 값·숫자만 있으면 en", () => {
  assert.equal(detectLanguage(""), "en");
  assert.equal(detectLanguage(null, undefined), "en");
  assert.equal(detectLanguage("2026"), "en");
});

test("NFD 입력도 ko 로 판별", () => {
  assert.equal(detectLanguage("한국어 요약".normalize("NFD")), "ko");
});
