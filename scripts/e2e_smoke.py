"""
Phase 1 E2E 스모크 테스트 (로컬 전용)

실행:
  uv run --with playwright==1.55.0 python scripts/e2e_smoke.py

전제: npm run dev (localhost:3000), npx supabase start (Mailpit 54324)
"""

import json
import re
import sys
import time
import urllib.request
import uuid

from playwright.sync_api import Page, expect, sync_playwright

BASE = "http://localhost:3000"
MAILPIT = "http://127.0.0.1:54324"
EMAIL = f"e2e-{uuid.uuid4().hex[:8]}@test.local"
PASSWORD = "Test-pass-1234"
SHOTS = "/tmp/lih-e2e"

results: list[tuple[str, bool, str]] = []


def check(name: str, fn):
    try:
        fn()
        results.append((name, True, ""))
        print(f"PASS {name}")
    except Exception as e:  # noqa: BLE001
        results.append((name, False, str(e)[:300]))
        print(f"FAIL {name}: {str(e)[:300]}")


def sql(query: str) -> str:
    """로컬 DB에 SQL 실행 (테스트 준비·정리용)"""
    import subprocess

    return subprocess.run(
        ["docker", "exec", "supabase_db_linkedin_intelligence", "psql", "-U", "postgres", "-tA", "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def confirm_link(email: str) -> str:
    """Mailpit API에서 인증 메일 링크 추출"""
    for _ in range(30):
        with urllib.request.urlopen(f"{MAILPIT}/api/v1/search?query=to:{email}") as r:
            data = json.load(r)
        if data.get("messages"):
            mid = data["messages"][0]["ID"]
            with urllib.request.urlopen(f"{MAILPIT}/api/v1/message/{mid}") as r:
                msg = json.load(r)
            m = re.search(r'href="([^"]+)"', msg.get("HTML", "")) or re.search(r"(http\S+verify\S+)", msg.get("Text", ""))
            if m:
                return m.group(1).replace("&amp;", "&")
        time.sleep(1)
    raise RuntimeError("confirmation mail not found")


def run():
    import os

    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ko-KR")
        page: Page = ctx.new_page()
        page.set_default_timeout(30000)
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())

        def unauth_redirect():
            page.goto(f"{BASE}/topics")
            expect(page).to_have_url(re.compile(r"/login\?next=%2Ftopics"))

        check("미인증 접근 시 /login 리다이렉트", unauth_redirect)

        def signup():
            page.goto(f"{BASE}/signup")
            page.fill("#name", "E2E User")
            page.fill("#email", EMAIL)
            page.fill("#password", PASSWORD)
            page.click("button[type=submit]")
            expect(page.get_by_text("인증 메일을 보냈습니다")).to_be_visible()

        check("회원가입 → 인증 메일 안내", signup)

        def confirm():
            link = confirm_link(EMAIL)
            page.goto(link)
            page.wait_for_load_state("networkidle")
            # 인증 후 세션이 생기면 대시보드, 아니면 로그인
            if "/login" in page.url:
                page.fill("#email", EMAIL)
                page.fill("#password", PASSWORD)
                page.click("button[type=submit]")
            expect(page.get_by_role("heading", name=re.compile("안녕하세요"))).to_be_visible()

        check("메일 인증 링크 → 로그인 → 대시보드", confirm)

        def dashboard():
            expect(page.get_by_text("Daily Top 10")).to_be_visible()
            expect(page.get_by_text("Weekly Top 10")).to_be_visible()
            expect(page.get_by_text("My Topics Update")).to_be_visible()
            expect(page.get_by_text("일부 콘텐츠는 DEMO DATA입니다")).to_be_visible()
            expect(page.locator("text=Agentic AI").first).to_be_visible()
            page.screenshot(path=f"{SHOTS}/dashboard.png", full_page=True)

        check("대시보드 위젯 + DEMO 표시 + 시드 주제", dashboard)

        def nav_all():
            for href, title in [
                ("/trending", "Trending Posts"),
                ("/influencers", "Influencers"),
                ("/following", "My Following"),
                ("/topics", "My Topics"),
                ("/knowledge", "Knowledge Base"),
                ("/saved", "Saved Posts"),
                ("/settings", "Settings"),
            ]:
                page.goto(f"{BASE}{href}")
                expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()

        check("사이드바 8개 메뉴 렌더링", nav_all)

        def topic_crud():
            page.goto(f"{BASE}/topics")
            expect(page.locator("a[href^='/topics/']")).to_have_count(10)
            page.get_by_role("button", name="주제 추가").click()
            page.fill("#name-new", "E2E Topic")
            page.fill("#keywords-new", "alpha, beta")
            page.get_by_role("button", name="추가", exact=True).click()
            expect(page.get_by_role("link", name="E2E Topic")).to_be_visible()
            # 수정
            card = page.locator("div.rounded-lg", has=page.get_by_role("link", name="E2E Topic")).last
            card.get_by_role("button", name="수정").click()
            page.locator("input[name=name]").last.fill("E2E Topic Edited")
            page.get_by_role("button", name="저장", exact=True).click()
            expect(page.get_by_role("link", name="E2E Topic Edited")).to_be_visible()
            # 비활성화
            card = page.locator("div.rounded-lg", has=page.get_by_role("link", name="E2E Topic Edited")).last
            card.get_by_role("button", name="수집 비활성화").click()
            expect(card.get_by_text("중지")).to_be_visible()
            # 삭제
            card.get_by_role("button", name="삭제").click()
            expect(page.get_by_role("link", name="E2E Topic Edited")).to_have_count(0)

        check("My Topics 생성/수정/비활성화/삭제", topic_crud)

        def korean_nfc():
            import subprocess
            import unicodedata

            nfc = "한국어 정규화"
            nfd = unicodedata.normalize("NFD", nfc)
            assert nfd != nfc
            page.goto(f"{BASE}/topics")
            page.get_by_role("button", name="주제 추가").click()
            page.fill("#name-new", nfd)
            page.fill("#keywords-new", unicodedata.normalize("NFD", "검색, 요약"))
            page.get_by_role("button", name="추가", exact=True).click()
            expect(page.get_by_text("주제를 추가했습니다.")).to_be_visible()
            out = subprocess.run(
                ["docker", "exec", "supabase_db_linkedin_intelligence", "psql", "-U", "postgres", "-tA", "-c",
                 # 문자열 비교는 바이트 단위 → NFD로 저장됐다면 NFC 리터럴과 일치하지 않음
                 "select count(*) from public.topics t join public.profiles p on p.id = t.user_id "
                 f"where p.email = '{EMAIL}' and t.name = '{nfc}' and t.keywords = array['검색','요약']"],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
            assert out == "1", f"NFC 정규화 저장 실패 (일치 행 수: {out!r})"

        check("한국어 입력 NFC 정규화 저장", korean_nfc)

        def following_crud():
            page.goto(f"{BASE}/following")
            page.get_by_role("button", name="인물 추가").click()
            page.fill("#pname-new", "Jane Doe")
            page.fill("#ptitle-new", "Chief AI Officer")
            page.fill("#pcompany-new", "Example Corp")
            page.fill("#plinkedin-new", "https://evil.example.com/in/jane")
            page.get_by_role("button", name="추가", exact=True).click()
            expect(page.get_by_text("linkedin.com/ 으로 시작하는")).to_be_visible()
            page.fill("#plinkedin-new", "https://www.linkedin.com/in/jane-doe-example")
            page.get_by_label("Agentic AI").check()
            page.get_by_role("button", name="추가", exact=True).click()
            expect(page.get_by_role("heading", name="Jane Doe")).to_be_visible()
            # 콘텐츠 링크: LinkedIn / GitHub / 미등록 도메인
            for url, title in [
                ("https://www.linkedin.com/posts/jane-doe_agentic-ai-example", "LinkedIn 게시글"),
                ("https://github.com/example/agent-framework", "GitHub 저장소"),
                ("https://example.org/blog/post", "개인 블로그"),
            ]:
                page.locator("input[name=url]").first.fill(url)
                page.locator("input[name=title]").first.fill(title)
                page.get_by_role("button", name="링크 추가").first.click()
                expect(page.get_by_role("link", name=title)).to_be_visible()
            expect(page.get_by_role("img", name="LinkedIn 로고").first).to_be_visible()
            expect(page.get_by_role("img", name="GitHub 로고")).to_be_visible()
            page.screenshot(path=f"{SHOTS}/following.png", full_page=True)
            # 비활성화 → 활성화
            page.get_by_role("button", name="비활성화").first.click()
            expect(page.get_by_text("비활성", exact=True)).to_be_visible()
            page.get_by_role("button", name="활성화", exact=True).first.click()
            expect(page.get_by_text("비활성", exact=True)).to_have_count(0)

        check("My Following 추가/URL 검증/링크·로고/활성 토글", following_crud)

        def dashboard_following():
            page.goto(f"{BASE}/")
            expect(page.get_by_role("link", name="LinkedIn 게시글")).to_be_visible()

        check("대시보드 My Following Update 반영", dashboard_following)

        def saved_flow():
            page.goto(f"{BASE}/trending?period=monthly&limit=20")
            first = page.locator("article").first
            expect(first).to_be_visible()
            first.get_by_role("button", name="저장", exact=True).click()
            expect(first.get_by_role("button", name="저장 해제")).to_be_visible()
            page.goto(f"{BASE}/saved")
            expect(page.locator("article")).to_have_count(1)
            # 폴더
            page.fill("#folder-name", "Research")
            page.get_by_role("button", name="폴더 만들기").click()
            expect(page.get_by_role("link", name="Research")).to_be_visible()
            # 직접 URL 등록 (LinkedIn)
            page.get_by_role("button", name="URL 직접 등록").click()
            page.fill("#m-url", "javascript:alert(1)")
            page.fill("#m-title", "XSS 시도")
            page.get_by_role("button", name="등록 및 저장").click()
            expect(page.get_by_text("올바른 URL을 입력하세요")).to_be_visible()
            page.fill("#m-url", "https://www.linkedin.com/posts/someone_rag-example")
            page.fill("#m-title", "RAG 실무 적용 사례")
            page.fill("#m-tags", "rag, 사례")
            page.select_option("#m-folder", label="Research")
            page.get_by_role("button", name="등록 및 저장").click()
            expect(page.get_by_role("link", name="RAG 실무 적용 사례")).to_be_visible()
            expect(page.locator("article")).to_have_count(2)
            # 출처 로고: LinkedIn 링크 → LinkedIn 로고, DEMO 콘텐츠 → DEMO 로고
            art = page.locator("article", has=page.get_by_role("link", name="RAG 실무 적용 사례"))
            expect(art.get_by_role("img", name="LinkedIn 로고")).to_be_visible()
            expect(page.get_by_role("img", name="DEMO DATA 로고").first).to_be_visible()
            # 메모 편집 + KB 추가
            art.get_by_role("button", name="메모·태그 편집").click()
            art.locator("textarea[name=notes]").fill("핵심: 하이브리드 검색")
            art.get_by_text("Knowledge Base에 추가").click()
            art.get_by_role("button", name="저장", exact=True).click()
            expect(art.get_by_text("핵심: 하이브리드 검색")).to_be_visible()
            # 검색 / 태그 / 폴더 필터
            page.goto(f"{BASE}/saved?q=하이브리드")
            expect(page.locator("article")).to_have_count(1)
            page.goto(f"{BASE}/saved?tag=rag")
            expect(page.locator("article")).to_have_count(1)
            page.get_by_role("link", name="Research").click()
            expect(page.locator("article")).to_have_count(1)
            page.screenshot(path=f"{SHOTS}/saved.png", full_page=True)
            # Knowledge Base 반영
            page.goto(f"{BASE}/knowledge")
            expect(page.get_by_role("link", name="RAG 실무 적용 사례")).to_be_visible()
            # 삭제
            page.goto(f"{BASE}/saved")
            page.locator("article").first.get_by_role("button", name="저장 삭제").click()
            expect(page.locator("article")).to_have_count(1)

        check("Saved Posts 저장/폴더/직접등록/XSS차단/메모/필터/KB/삭제", saved_flow)

        def language_detection():
            # 요구사항 4.1: 직접 등록 콘텐츠의 language 판별 → Trending 언어 필터 반영
            ko_title, en_title = "에이전트 오케스트레이션 실무 가이드", "Agent orchestration field guide"
            for url, title in [("https://example.com/ko-guide", ko_title), ("https://example.com/en-guide", en_title)]:
                page.goto(f"{BASE}/saved")
                page.get_by_role("button", name="URL 직접 등록").click()
                page.fill("#m-url", url)
                page.fill("#m-title", title)
                page.get_by_role("button", name="등록 및 저장").click()
                expect(page.get_by_role("link", name=title)).to_be_visible()
            page.goto(f"{BASE}/trending?period=monthly&limit=50&lang=ko")
            expect(page.get_by_role("link", name=ko_title)).to_be_visible()
            expect(page.get_by_role("link", name=en_title)).to_have_count(0)
            page.goto(f"{BASE}/trending?period=monthly&limit=50&lang=en")
            expect(page.get_by_role("link", name=en_title)).to_be_visible()
            expect(page.get_by_role("link", name=ko_title)).to_have_count(0)

        check("직접 등록 콘텐츠 언어 판별 → Trending 언어 필터", language_detection)

        def global_search():
            page.goto(f"{BASE}/")
            page.get_by_label("전역 검색").fill("Jane")
            page.keyboard.press("Enter")
            expect(page).to_have_url(re.compile(r"/search\?q=Jane"))
            expect(page.get_by_role("link", name="Jane Doe")).to_be_visible()

        check("전역 검색", global_search)

        def settings():
            page.goto(f"{BASE}/settings")
            for name in ["LinkedIn", "Hacker News", "GitHub", "arXiv", "Hugging Face", "Reddit", "X", "OpenAI", "AWS", "NVIDIA"]:
                expect(page.get_by_role("img", name=f"{name} 로고").first).to_be_visible()
            expect(page.get_by_text("UNAVAILABLE").first).to_be_visible()
            page.fill("#s-name", "E2E Renamed")
            page.get_by_role("button", name="저장", exact=True).click()
            expect(page.get_by_text("설정을 저장했습니다.")).to_be_visible()
            page.screenshot(path=f"{SHOTS}/settings.png", full_page=True)

        check("Settings 소스 로고/권한 표시 + 프로필 저장", settings)

        def phase2_collection():
            # 요구사항 6.2: 로컬 fixture 피드로 수집 → 표시·분류·이력·제한 검증 (외부 네트워크 미사용)
            import functools
            import http.server
            import threading
            from pathlib import Path

            fixtures = str(Path(__file__).resolve().parent.parent / "tests" / "fixtures")
            handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=fixtures)
            handler.log_message = lambda *a, **k: None  # type: ignore[attr-defined]
            server = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), handler)
            threading.Thread(target=server.serve_forever, daemon=True).start()

            active = sql(
                "select coalesce(string_agg(id::text, ','), '') from public.data_sources "
                "where user_id is null and is_active and source_type not in ('demo','user_provided')"
            )
            try:
                if active:
                    sql(f"update public.data_sources set is_active = false where id = any(string_to_array('{active}', ',')::uuid[])")
                sql(
                    "insert into public.data_sources (slug, name, source_type, source_url, homepage_url, logo_key, "
                    "connection_status, permission_status, storage_allowed, display_allowed, retention_days, is_active) values "
                    "('e2e-fixture', 'E2E Fixture Feed', 'rss', 'http://127.0.0.1:8765/e2e-feed.xml', 'https://fixture.example.org', "
                    "'rss', 'connected', 'NOT_VERIFIED', true, true, 30, true)"
                )
                hit = "E2E fixture: Agentic AI deployment patterns"
                miss = "E2E fixture: 오늘의 요리 레시피"

                page.goto(f"{BASE}/settings")
                page.get_by_role("button", name="지금 수집").click()
                expect(page.get_by_text(re.compile(r"수집을 완료했습니다\. 소스 1개, 저장 1건"))).to_be_visible(timeout=60000)

                # 주제와 일치한 글만 저장, 출처 로고 표시
                page.goto(f"{BASE}/trending?period=monthly&limit=50")
                art = page.locator("article", has=page.get_by_role("link", name=hit))
                expect(art).to_be_visible()
                expect(art.get_by_role("img", name="RSS 로고")).to_be_visible()
                expect(art.get_by_text("E2E Fixture Feed")).to_be_visible()
                expect(page.get_by_role("link", name=miss)).to_have_count(0)

                # 주제 연결 (Agentic AI)
                page.goto(f"{BASE}/topics")
                page.get_by_role("link", name="Agentic AI", exact=True).click()
                expect(page.get_by_role("link", name=hit)).to_be_visible()

                # 수집 이력 + 10분 제한
                page.goto(f"{BASE}/settings")
                log = page.get_by_role("table", name="최근 수집 이력")
                expect(log.get_by_text("E2E Fixture Feed").first).to_be_visible()
                expect(log.get_by_text("성공").first).to_be_visible()
                page.get_by_role("button", name="지금 수집").click()
                expect(page.get_by_text(re.compile("10분에 한 번"))).to_be_visible()

                # 사용자 RSS: http·내부 주소 거부
                page.fill("#feed-name", "내 피드")
                page.fill("#feed-url", "http://example.com/feed.xml")
                page.get_by_role("button", name="피드 추가").click()
                expect(page.get_by_text("https 로 시작하는 피드 URL만").first).to_be_visible()
                page.fill("#feed-url", "https://127.0.0.1/feed.xml")
                page.get_by_role("button", name="피드 추가").click()
                expect(page.get_by_text(re.compile("허용되지 않는 주소")).first).to_be_visible()
                expect(page.get_by_role("list", name="내 RSS 피드 목록")).to_have_count(0)
                page.screenshot(path=f"{SHOTS}/settings-collection.png", full_page=True)
            finally:
                sql("delete from public.data_sources where slug = 'e2e-fixture' and user_id is null")
                if active:
                    sql(f"update public.data_sources set is_active = true where id = any(string_to_array('{active}', ',')::uuid[])")
                server.shutdown()

        check("Phase 2 수집: fixture 피드 → 분류·로고·이력·10분 제한·SSRF 차단", phase2_collection)

        def dark_mode():
            page.goto(f"{BASE}/")
            page.get_by_role("button", name=re.compile("테마 변경")).click()
            page.wait_for_timeout(300)
            cls = page.evaluate("document.documentElement.className")
            page.get_by_role("button", name=re.compile("테마 변경")).click()
            page.wait_for_timeout(300)
            cls2 = page.evaluate("document.documentElement.className")
            assert ("dark" in cls) or ("dark" in cls2), f"dark class not toggled: {cls} / {cls2}"
            page.evaluate("document.documentElement.classList.add('dark')")
            page.screenshot(path=f"{SHOTS}/dashboard-dark.png", full_page=True)

        check("다크 모드 토글", dark_mode)

        def mobile():
            m = ctx.new_page()
            m.set_viewport_size({"width": 390, "height": 844})
            m.goto(f"{BASE}/")
            m.get_by_role("button", name="메뉴 열기").click()
            m.get_by_role("dialog", name="메뉴").get_by_role("link", name="My Topics").click()
            expect(m.get_by_role("heading", name="My Topics", exact=True)).to_be_visible()
            m.screenshot(path=f"{SHOTS}/mobile-topics.png", full_page=True)
            m.close()

        check("모바일 반응형 메뉴", mobile)

        def logout():
            page.goto(f"{BASE}/")
            page.get_by_role("button", name="사용자 메뉴").click()
            page.get_by_role("button", name="로그아웃").click()
            expect(page).to_have_url(re.compile(r"/login"))
            page.goto(f"{BASE}/saved")
            expect(page).to_have_url(re.compile(r"/login"))

        check("로그아웃 후 보호 페이지 차단", logout)

        def account_delete():
            # 직전 리다이렉트의 ?next=/saved 로 돌아가는지 함께 확인
            page.fill("#email", EMAIL)
            page.fill("#password", PASSWORD)
            page.click("button[type=submit]")
            expect(page).to_have_url(re.compile(r"/saved$"))
            page.goto(f"{BASE}/settings")
            page.fill("#del-confirm", "DELETE")
            page.get_by_role("button", name="계정 영구 삭제").click()
            expect(page).to_have_url(re.compile(r"/login\?notice=deleted"))
            page.fill("#email", EMAIL)
            page.fill("#password", PASSWORD)
            page.click("button[type=submit]")
            expect(page.get_by_text("이메일 또는 비밀번호가 올바르지 않습니다.")).to_be_visible()

        check("계정 삭제 → 재로그인 불가", account_delete)

        if errors:
            results.append(("브라우저 런타임 오류 없음", False, " | ".join(errors[:5])))
            print("FAIL page errors:", errors[:5])
        else:
            results.append(("브라우저 런타임 오류 없음", True, ""))
        browser.close()

    failed = [r for r in results if not r[1]]
    print(f"\n{len(results) - len(failed)}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    run()
