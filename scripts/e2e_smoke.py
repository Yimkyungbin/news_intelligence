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
import urllib.parse
import urllib.request
import uuid

from playwright.sync_api import Page, expect, sync_playwright

BASE = "http://localhost:3000"
MAILPIT = "http://127.0.0.1:54324"
EMAIL = f"e2e-{uuid.uuid4().hex[:8]}@test.local"
PASSWORD = "Test-pass-1234"
SHOTS = "/tmp/lih-e2e"

results: list[tuple[str, bool, str]] = []

# 테스트 고정 데이터 (slug, 제목, URL, 유형, 인기 지표, 키워드, 몇 시간 전, 연결 주제)
FIXTURES = [
    ("hacker-news", "Enterprise agentic AI adoption checklist", "https://news.ycombinator.com/item?id=990001", "discussion", '{"points": 120, "comments": 30}',
     ["agentic ai", "enterprise ai"], 3, ["Agentic AI", "Enterprise AI Platform"]),
    ("arxiv", "RAG evaluation methods survey", "https://arxiv.org/abs/2611.99001", "paper", "{}",
     ["rag", "evaluation"], 30, ["RAG / Knowledge Management", "MLOps / LLMOps"]),
    ("hugging-face", "Open-weight model release roundup", "https://huggingface.co/e2e/open-model", "model", '{"likes": 50}',
     ["llm", "open weight"], 6, ["LLM / Open-weight Models"]),
]


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
            expect(page.get_by_role("heading", name="오늘의 트렌드")).to_be_visible()

        check("메일 인증 링크 → 로그인 → 대시보드", confirm)

        def seed_fixtures():
            # 예시 데이터가 없으므로 테스트용 수집 콘텐츠를 직접 넣음 (계정 삭제 시 함께 삭제)
            uid = sql(f"select id from public.profiles where email = '{EMAIL}'")
            for slug, title, url, ctype, pop, kws, hours, topics in FIXTURES:
                sql(
                    "insert into public.content_items (user_id, source_id, title, summary, original_url, source_name, source_type, "
                    "published_at, language, content_type, keywords, popularity, provenance, permission_status, storage_allowed, display_allowed) "
                    f"select '{uid}', id, '{title}', 'Fixture summary for {title}.', '{url}', name, source_type, now() - interval '{hours} hours', "
                    f"'en', '{ctype}', array[{','.join(repr(k) for k in kws)}], '{pop}'::jsonb, 'collected', 'NOT_VERIFIED', true, true "
                    f"from public.data_sources where slug = '{slug}' and user_id is null"
                )
                sql(
                    "insert into public.content_topics (content_id, topic_id, relevance_score) "
                    f"select c.id, t.id, 1 from public.content_items c join public.topics t on t.user_id = c.user_id "
                    f"where c.original_url = '{url}' and c.user_id = '{uid}' and t.name in ({','.join(repr(t) for t in topics)})"
                )
            assert sql(f"select count(*) from public.content_items where user_id = '{uid}'") == str(len(FIXTURES))

        check("테스트 고정 데이터 준비 (예시 데이터 없음 확인)", seed_fixtures)

        def dashboard():
            # 메인: 트렌드 한눈에(카테고리 비중·급상승) + Daily/Weekly Top 10 + 논문 섹션. 수치 통계는 Statistics 로 이동
            # 고정 데이터는 로그인 후 SQL 로 넣었으므로 화면을 다시 불러옴
            page.goto(f"{BASE}/")
            expect(page.get_by_role("heading", name="오늘의 트렌드")).to_be_visible()
            expect(page.get_by_text("Daily Top 10")).to_be_visible()
            expect(page.get_by_text("트렌드 한눈에")).to_be_visible()
            expect(page.get_by_role("img", name=re.compile("^카테고리 비중"))).to_be_visible()
            expect(page.get_by_text("Today's Intelligence")).to_have_count(0)
            expect(page.get_by_text("My Topics Update")).to_be_visible()
            expect(page.get_by_text("DEMO DATA")).to_have_count(0)
            expect(page.locator("text=Agentic AI").first).to_be_visible()
            # 배치: AI Daily Briefing 이 최상단, 급상승 키워드는 행 목록
            briefing_y = page.get_by_text("AI Daily Briefing").first.bounding_box()["y"]
            trend_y = page.get_by_text("트렌드 한눈에").first.bounding_box()["y"]
            assert briefing_y < trend_y, "AI Daily Briefing 이 트렌드 한눈에 위에 있어야 함"
            expect(page.get_by_role("table", name="카테고리별 건수")).to_be_visible()
            # 고정 데이터 3건으로는 급상승 키워드(2건 이상)가 없을 수 있어 카드 제목만 확인
            expect(page.get_by_text("급상승 키워드", exact=True).first).to_be_visible()
            # 논문은 메인에서 빠지고 Papers 메뉴에서 표시 (30시간 전 fixture → 최근 7일)
            expect(page.get_by_role("button", name="RAG evaluation methods survey")).to_have_count(0)
            # 반응 지표: 출처 제공 지표 + 출처 내 순위, URL 은 카드에 노출하지 않음
            hn = page.locator("article", has=page.get_by_role("button", name="Enterprise agentic AI adoption checklist"))
            expect(hn.get_by_label("반응 지표")).to_contain_text("120")
            expect(hn.get_by_text("news.ycombinator.com")).to_have_count(0)
            page.screenshot(path=f"{SHOTS}/dashboard.png", full_page=True)
            # Weekly 전환
            page.get_by_role("group", name="기간").get_by_role("link", name="Weekly").click()
            expect(page).to_have_url(re.compile(r"period=weekly"))
            expect(page.get_by_text("Weekly Top 10")).to_be_visible()

        check("대시보드 브리핑 최상단·트렌드 한눈에·급상승 키워드·Top 10 + 예시 데이터 없음", dashboard)

        def papers():
            page.goto(f"{BASE}/papers")
            expect(page.get_by_role("heading", name="Papers", exact=True)).to_be_visible()
            art = page.locator("article", has=page.get_by_role("button", name="RAG evaluation methods survey"))
            expect(art).to_have_count(1)
            expect(art.get_by_text("논문", exact=True)).to_be_visible()
            expect(page.get_by_role("list", name="출처별 논문 수")).to_contain_text("arXiv AI·NLP·ML")
            # 출처 필터: HF Daily Papers 에는 fixture 논문 없음
            page.get_by_role("group", name="논문 출처").get_by_role("link", name=re.compile(r"^HF Daily Papers")).click()
            expect(page).to_have_url(re.compile(r"source=hf-papers"))
            expect(page.get_by_role("button", name="RAG evaluation methods survey")).to_have_count(0)
            page.screenshot(path=f"{SHOTS}/papers.png", full_page=True)

        check("Papers 메뉴: 논문 목록·출처별 건수·출처 필터", papers)

        def dashboard_insights():
            demo_title = "Enterprise agentic AI adoption checklist"
            page.goto(f"{BASE}/")

            # 1) 항목 설명: ⓘ 버튼 → 설명 팝오버, Esc 로 닫힘
            page.get_by_role("button", name="Daily Top 10 설명").click()
            note = page.get_by_role("note")
            expect(note).to_contain_text("출처 안에서의 순위")
            page.keyboard.press("Escape")
            expect(note).to_have_count(0)
            # 2) 상세 보기: 제목 클릭 → 패널(요약·데이터 권한·원문 링크·연결 주제), Esc 로 닫힘
            page.get_by_role("button", name=demo_title).first.click()
            dialog = page.get_by_role("dialog", name=demo_title)
            expect(dialog).to_be_visible()
            expect(dialog.get_by_text("요약 (출처 제공 원문 일부)")).to_be_visible()
            expect(dialog.get_by_text("데이터 권한")).to_be_visible()
            expect(dialog.get_by_text(re.compile("AI 번역·요약이 허용되지 않았습니다"))).to_be_visible()
            expect(dialog.get_by_role("link", name="원문 열기")).to_have_attribute("href", re.compile(r"news\.ycombinator\.com"))
            expect(dialog.get_by_role("link", name="Agentic AI", exact=True)).to_be_visible()
            page.screenshot(path=f"{SHOTS}/dashboard-detail.png")
            page.keyboard.press("Escape")
            expect(dialog).to_be_hidden()

            # 3) My Topics Update 펼치기 → 최신 콘텐츠 목록 → 상세 보기
            page.get_by_role("button", name=re.compile(r"^Agentic AI 최신 콘텐츠 펼치기")).click()
            topic_list = page.get_by_role("list", name="Agentic AI 최신 콘텐츠")
            expect(topic_list.get_by_role("button", name=demo_title)).to_be_visible()
            topic_list.get_by_role("button", name=demo_title).click()
            expect(page.get_by_role("dialog", name=demo_title)).to_be_visible()
            page.get_by_role("button", name="상세 보기 닫기").click()
            expect(page.get_by_role("dialog", name=demo_title)).to_be_hidden()

            # 4) Statistics 로 옮긴 요약 지표·키워드 순위 → Trending 키워드 필터
            page.goto(f"{BASE}/statistics")
            page.get_by_role("button", name="오늘 신규 콘텐츠 설명").click()
            expect(page.get_by_role("note")).to_contain_text("KST 00:00")
            page.keyboard.press("Escape")
            page.get_by_role("list", name="최근 7일 키워드 순위").get_by_role("link").first.click()
            expect(page).to_have_url(re.compile(r"/trending\?.*kw="))
            expect(page.get_by_role("link", name=re.compile("키워드 필터 .* 해제"))).to_be_visible()
            assert page.locator("article").count() >= 1, "키워드 필터 결과가 비어 있음"

        check("대시보드 항목 설명·상세 보기·주제 펼치기 + Statistics 요약·키워드 이동", dashboard_insights)

        def categories():
            demo_title = "Enterprise agentic AI adoption checklist"
            # 메인 카테고리 칩 → Top 10 필터 (fixture 는 '활용 사례': enterprise·adoption)
            page.goto(f"{BASE}/?period=weekly")
            page.get_by_role("group", name="카테고리 필터").get_by_role("link", name=re.compile(r"^활용 사례")).click()
            expect(page).to_have_url(re.compile(r"cat=usecase"))
            expect(page.get_by_text(re.compile("카테고리: 활용 사례")).first).to_be_visible()
            expect(page.get_by_role("button", name=demo_title)).to_be_visible()
            expect(page.get_by_role("button", name="Open-weight model release roundup")).to_have_count(0)
            # Trending 카테고리 탭: 개요(8개 카테고리) → 모아보기 → 필터된 목록
            page.goto(f"{BASE}/trending?view=category&period=weekly")
            expect(page.get_by_role("tab", name="카테고리")).to_have_attribute("aria-selected", "true")
            expect(page.get_by_role("region", name=re.compile(r"카테고리$"))).to_have_count(8)
            case = page.get_by_role("region", name="활용 사례 카테고리")
            expect(case.get_by_role("button", name=demo_title)).to_be_visible()
            page.screenshot(path=f"{SHOTS}/trending-categories.png", full_page=True)
            case.get_by_role("link", name="활용 사례 모아보기 →").click()
            expect(page).to_have_url(re.compile(r"view=category.*cat=usecase|cat=usecase.*view=category"))
            expect(page.get_by_role("link", name="카테고리 필터 활용 사례 해제")).to_be_visible()
            expect(page.locator("article", has=page.get_by_role("button", name=demo_title))).to_have_count(1)
            assert page.locator("article").count() == 1, "카테고리 필터에 다른 카테고리 콘텐츠가 섞임"

        check("카테고리 태깅·메인 필터·Trending 카테고리 탭 모아보기", categories)

        def nav_all():
            menu = [
                ("/trending", "Trending Posts"),
                ("/papers", "Papers"),
                ("/influencers", "Influencers"),
                ("/topics", "My Topics"),
                ("/knowledge", "Knowledge Base"),
                ("/saved", "Saved Posts"),
                ("/statistics", "Statistics"),
                ("/settings", "Settings"),
            ]
            for href, title in menu:
                page.goto(f"{BASE}{href}")
                expect(page.get_by_role("heading", name=title, exact=True)).to_be_visible()
            # 사이드바 순서: Statistics 는 Settings 바로 위
            labels = [t.strip() for t in page.locator("aside nav a").all_inner_texts()]
            assert labels.index("Statistics") == labels.index("Settings") - 1, f"메뉴 순서: {labels}"

        check("사이드바 메뉴 렌더링·순서 (Papers 추가, Statistics 는 Settings 위)", nav_all)

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
            # 기존 /following 은 Influencers '팔로우 중' 탭으로 이동
            page.goto(f"{BASE}/following")
            expect(page).to_have_url(re.compile(r"/influencers\?tab=following"))
            expect(page.get_by_role("tab", name=re.compile(r"^팔로우 중"))).to_have_attribute("aria-selected", "true")
            page.get_by_role("button", name="팔로우할 인물 추가").click()
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
            # 팔로우 해제 → '팔로우 후보' 탭으로 이동, 다시 팔로우 → '팔로우 중' 탭
            page.get_by_role("button", name="팔로우 해제").first.click()
            expect(page.get_by_role("heading", name="Jane Doe")).to_have_count(0)
            page.get_by_role("tab", name=re.compile(r"^팔로우 후보")).click()
            expect(page.get_by_role("heading", name="Jane Doe")).to_be_visible()
            page.get_by_role("button", name="팔로우", exact=True).first.click()
            expect(page.get_by_role("heading", name="Jane Doe")).to_have_count(0)
            page.get_by_role("tab", name=re.compile(r"^전체")).click()
            expect(page.get_by_role("heading", name="Jane Doe")).to_be_visible()

        check("Influencers 통합: 팔로우 중 탭 추가/URL 검증/링크·로고/활성·팔로우 토글/탭 이동", following_crud)

        def dashboard_following():
            page.goto(f"{BASE}/")
            expect(page.get_by_role("link", name="LinkedIn 게시글")).to_be_visible()

        check("대시보드 Following Update 반영", dashboard_following)

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
            expect(page.get_by_role("button", name="RAG 실무 적용 사례")).to_be_visible()
            expect(page.locator("article")).to_have_count(2)
            # 출처 로고: LinkedIn 링크 → LinkedIn 로고, 수집 콘텐츠 → 출처 로고
            art = page.locator("article", has=page.get_by_role("button", name="RAG 실무 적용 사례"))
            expect(art.get_by_role("img", name="LinkedIn 로고")).to_be_visible()
            expect(page.get_by_role("img", name="Hacker News 로고").first).to_be_visible()
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
            expect(page.get_by_role("button", name="RAG 실무 적용 사례")).to_be_visible()
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
                expect(page.get_by_role("button", name=title)).to_be_visible()
            page.goto(f"{BASE}/trending?period=monthly&limit=50&lang=ko")
            expect(page.get_by_role("button", name=ko_title)).to_be_visible()
            expect(page.get_by_role("button", name=en_title)).to_have_count(0)
            page.goto(f"{BASE}/trending?period=monthly&limit=50&lang=en")
            expect(page.get_by_role("button", name=en_title)).to_be_visible()
            expect(page.get_by_role("button", name=ko_title)).to_have_count(0)

        check("직접 등록 콘텐츠 언어 판별 → Trending 언어 필터", language_detection)

        def phase3_ai():
            # Phase 3: AI 처리 동의 → 요약(모의 AI) → 주제 인사이트 → Daily Briefing → 철회. 외부 AI 미사용(AI_PROVIDER=mock)
            title = "RAG 에이전트 평가 실무 가이드"
            url = "https://example.com/ai-consent-guide"

            def content_id() -> str:
                return sql(
                    "select c.id from public.content_items c join public.profiles p on p.id = c.user_id "
                    f"where p.email = '{EMAIL}' and c.original_url = '{url}'"
                )

            page.goto(f"{BASE}/saved")
            page.get_by_role("button", name="URL 직접 등록").click()
            page.fill("#m-url", url)
            page.fill("#m-title", title)
            page.fill("#m-summary", "RAG 파이프라인과 에이전트 평가 방법을 정리한 글입니다.")
            page.get_by_role("button", name="등록 및 저장").click()
            expect(page.get_by_role("button", name=title)).to_be_visible()
            cid = content_id()
            assert cid, "등록 콘텐츠 없음"
            # 직접 등록 콘텐츠가 관심 주제(RAG)에 자동 연결됨
            assert sql(f"select count(*) from public.content_topics where content_id = '{cid}'") != "0", "주제 자동 연결 안 됨"

            # 1) 기본 차단 → 동의해야만 허용
            page.get_by_role("button", name=title).click()
            dialog = page.get_by_role("dialog", name=title)
            expect(dialog.get_by_text("권리를 확인한 경우에만")).to_be_visible()
            allow = dialog.get_by_role("button", name="AI 처리 허용", exact=True)
            expect(allow).to_be_disabled()
            dialog.get_by_label(re.compile("외부 AI\\(OpenAI\\)로 보내 요약할 권리")).check()
            allow.click()
            expect(page.get_by_text("AI 처리를 허용했습니다.")).to_be_visible()
            # 허용 직후 자동 요약이 바로 시작되므로 상태(pending/processing/completed)가 아닌 허용 여부만 확인
            assert sql(f"select ai_processing_allowed::text from public.content_items where id = '{cid}'") == "true"

            # 2) AI 요약: 허용 직후 자동 생성 (모의 AI → DEMO 표시)
            expect(page.get_by_text("DEMO 모의 AI 요약을 생성했습니다.")).to_be_visible(timeout=30000)
            expect(dialog.get_by_text(re.compile(r"^\[DEMO 요약\]"))).to_be_visible()
            expect(dialog.get_by_text("DEMO 모의 AI")).to_be_visible()
            expect(dialog.get_by_text("산업·비즈니스 영향", exact=True)).to_be_visible()
            assert sql(f"select provider || ':' || is_demo::text from public.ai_insights where content_id = '{cid}'") == "mock:true"
            page.keyboard.press("Escape")

            # 3) 운영자가 허용하지 않은 수집 콘텐츠는 동의 옵션 없이 안내만
            page.goto(f"{BASE}/trending?period=monthly&limit=50")
            page.get_by_role("button", name="Enterprise agentic AI adoption checklist").first.click()
            demo_dialog = page.get_by_role("dialog", name="Enterprise agentic AI adoption checklist")
            expect(demo_dialog.get_by_text(re.compile("AI 번역·요약이 허용되지 않았습니다"))).to_be_visible()
            expect(demo_dialog.get_by_role("button", name="AI 처리 허용", exact=True)).to_have_count(0)
            expect(demo_dialog.get_by_role("button", name="AI 요약 생성")).to_have_count(0)
            page.keyboard.press("Escape")

            # 4) Topic Intelligence: 허용 콘텐츠만 분석, 미허용은 제외 표시
            page.goto(f"{BASE}/topics")
            page.get_by_role("link", name="RAG / Knowledge Management", exact=True).click()
            page.get_by_role("button", name="AI 인사이트 생성").click()
            expect(page.get_by_text(re.compile(r"주제 인사이트를 생성했습니다 \(콘텐츠 1건 분석\)"))).to_be_visible(timeout=30000)
            expect(page.get_by_text(re.compile(r"^\[DEMO\] 'RAG / Knowledge Management' 주제"))).to_be_visible()
            expect(page.get_by_text(re.compile(r"AI 미허용 \d+건 제외"))).to_be_visible()

            # 5) Daily Briefing: 대시보드에서 생성 → 6개 섹션, AI 섹션은 허용 콘텐츠로 생성
            page.goto(f"{BASE}/")
            page.get_by_role("button", name="지금 생성").click()
            expect(page.get_by_text("브리핑을 생성했습니다.")).to_be_visible(timeout=60000)
            # 대시보드 브리핑은 AI 인사이트만 (트렌드 TOP 5 는 브리핑 전체 화면에서 확인)
            expect(page.get_by_text(re.compile(r"\[DEMO\] AI 처리 허용 콘텐츠 1건 기반"))).to_be_visible()
            page.goto(f"{BASE}/briefing")
            for section in ["오늘의 주요 기술 트렌드 TOP 5", "주요 신규 콘텐츠 TOP 10", "관심 주제별 업데이트", "주요 인플루언서 콘텐츠", "AI가 선정한 핵심 인사이트", "전일 대비 주요 변화"]:
                expect(page.get_by_role("region", name=section)).to_be_visible()
            expect(page.get_by_role("list", name="브리핑 실행 이력").get_by_text("성공").first).to_be_visible()
            page.get_by_role("region", name="AI가 선정한 핵심 인사이트").get_by_role("button", name="근거 1").first.click()
            expect(page.get_by_role("dialog", name=title)).to_be_visible()
            page.keyboard.press("Escape")
            page.screenshot(path=f"{SHOTS}/briefing.png", full_page=True)
            # 수동 생성 10분 제한
            page.get_by_role("button", name="지금 생성").click()
            expect(page.get_by_text(re.compile("10분에 한 번 생성"))).to_be_visible()

            # 6) 철회 → AI 결과 삭제, 차단 상태로 복귀
            page.goto(f"{BASE}/saved")
            page.get_by_role("button", name=title).click()
            dialog = page.get_by_role("dialog", name=title)
            dialog.get_by_role("button", name="AI 처리 허용 철회").click()
            expect(page.get_by_text("AI 처리 허용을 철회하고 AI 결과를 삭제했습니다.")).to_be_visible()
            expect(dialog.get_by_text("권리를 확인한 경우에만")).to_be_visible()
            assert sql(f"select count(*) from public.ai_insights where content_id = '{cid}'") == "0"
            assert sql(f"select ai_processing_allowed::text || ai_processing_status from public.content_items where id = '{cid}'") == "falseblocked"
            page.keyboard.press("Escape")

            # 7) Cron 엔드포인트는 인증 없이 호출 불가
            # (CRON_SECRET 설정 시 401, 미설정 환경(CI)에서는 503 — 둘 다 실행 거부)
            assert page.request.get(f"{BASE}/api/cron/briefing").status in (401, 503)

        check("Phase 3 AI: 동의·요약·주제 인사이트·브리핑·철회 (모의 AI)", phase3_ai)

        def sources_stats_insights():
            demo_title = "Enterprise agentic AI adoption checklist"

            # 1) 소스 on/off: Hacker News 를 끄면 피드에서 숨김, 다시 켜면 복원
            page.goto(f"{BASE}/settings")
            page.get_by_role("switch", name="Hacker News 끄기").click()
            expect(page.get_by_text("'Hacker News'을(를) 껐습니다.", exact=False)).to_be_visible(timeout=60000)
            page.goto(f"{BASE}/trending?period=monthly&limit=50")
            expect(page.get_by_role("button", name=demo_title)).to_have_count(0)
            page.goto(f"{BASE}/")
            expect(page.get_by_role("button", name=demo_title)).to_have_count(0)
            page.goto(f"{BASE}/settings")
            page.get_by_role("switch", name="Hacker News 켜기").click()
            expect(page.get_by_text("'Hacker News'을(를) 켰습니다.", exact=False)).to_be_visible(timeout=60000)
            page.goto(f"{BASE}/trending?period=monthly&limit=50")
            expect(page.get_by_role("button", name=demo_title).first).to_be_visible()

            # 1-1) 사용 열 전체 끄기 → 피드 숨김 / 전체 켜기 → 복원 (내 계정 기준, 한 번의 요청)
            page.goto(f"{BASE}/settings")
            page.get_by_role("switch", name=re.compile(r"^사용 전체 끄기")).click()
            expect(page.get_by_text(re.compile(r"소스 \d+개를 모두 껐습니다"))).to_be_visible(timeout=60000)
            off_count = sql(
                "select count(*) from public.user_source_settings s join public.profiles p on p.id = s.user_id "
                f"where p.email = '{EMAIL}' and not s.enabled"
            )
            assert int(off_count) > 1, f"전체 끄기 미반영: {off_count}"
            page.reload()
            expect(page.get_by_role("switch", name="Hacker News 켜기")).to_be_visible()
            page.goto(f"{BASE}/trending?period=monthly&limit=50")
            expect(page.get_by_role("button", name=demo_title)).to_have_count(0)
            page.goto(f"{BASE}/settings")
            page.get_by_role("switch", name=re.compile(r"^사용 전체 켜기")).click()
            expect(page.get_by_text(re.compile(r"소스 \d+개를 모두 켰습니다"))).to_be_visible(timeout=60000)
            page.reload()
            expect(page.get_by_role("switch", name=re.compile(r"^사용 전체 끄기"))).to_be_visible()
            page.goto(f"{BASE}/trending?period=monthly&limit=50")
            expect(page.get_by_role("button", name=demo_title).first).to_be_visible()

            # 2) Statistics: 메뉴 → 통계 갱신 → 차트·출처·키워드 → 날짜 상세
            page.goto(f"{BASE}/statistics")
            page.get_by_role("button", name="통계 갱신").click()
            expect(page.get_by_text(re.compile(r"통계를 갱신했습니다|10분에 한 번"))).to_be_visible(timeout=60000)
            page.reload()
            expect(page.get_by_role("img", name=re.compile("^일별 콘텐츠 수"))).to_be_visible()
            expect(page.get_by_role("list", name="기간 출처별 건수")).to_be_visible()
            expect(page.get_by_text("키워드 추이")).to_be_visible()
            day = sql(
                "select max(s.stat_date)::text from public.daily_stats s join public.profiles p on p.id = s.user_id "
                f"where p.email = '{EMAIL}'"
            )
            assert day, "통계가 저장되지 않음"
            page.goto(f"{BASE}/statistics?range=30&date={day}")
            expect(page.get_by_role("list", name=f"{day} 인기 콘텐츠").get_by_role("listitem").first).to_be_visible()

            # 3) 운영자 AI 허용(정책 B) → 번역·시사점(모의 AI) → 번역 토글 → 트렌드 AI 시사점 → 차단 복원
            url = "https://techcrunch.com/e2e-agent-framework"
            title = "OpenAI ships new agent framework for enterprises"
            # 테스트 전용 시스템 소스 (실제 소스의 운영자 설정·번역 캐시를 건드리지 않음)
            sql("delete from public.data_sources where slug = 'e2e-ai-source' and user_id is null")
            sql(
                "insert into public.data_sources (slug, name, source_type, source_url, homepage_url, logo_key, connection_status, "
                "permission_status, storage_allowed, display_allowed, retention_days, is_active) values "
                "('e2e-ai-source', 'E2E AI Source', 'news', 'http://127.0.0.1:9/none.xml', 'https://techcrunch.com', 'techcrunch', "
                "'connected', 'NOT_VERIFIED', true, true, 30, false)"
            )
            src = "(select id from public.data_sources where slug = 'e2e-ai-source' and user_id is null)"
            uid = sql(f"select id from public.profiles where email = '{EMAIL}'")
            sql(
                "insert into public.content_items (user_id, source_id, title, summary, original_url, source_name, source_type, "
                "published_at, language, content_type, keywords, provenance, permission_status, storage_allowed, display_allowed) "
                f"select '{uid}', id, '{title}', 'A new framework for building agentic AI apps.', '{url}', name, source_type, "
                "now() - interval '2 hours', 'en', 'article', array['agentic ai'], 'collected', 'NOT_VERIFIED', true, true "
                "from public.data_sources where slug = 'e2e-ai-source' and user_id is null"
            )
            sql(
                "insert into public.content_topics (content_id, topic_id, relevance_score) "
                f"select c.id, t.id, 1 from public.content_items c join public.topics t on t.user_id = c.user_id and t.name = 'Agentic AI' "
                f"where c.original_url = '{url}'"
            )
            try:
                page.goto(f"{BASE}/settings")
                page.get_by_role("switch", name="E2E AI Source AI 번역·요약 허용").click()
                expect(page.get_by_text(re.compile("'E2E AI Source'의 AI 번역·요약을 허용했습니다"))).to_be_visible(timeout=60000)
                # 번역·시사점은 응답 후 백그라운드(after)에서 생성 → 최대 30초 대기
                cached = ""
                for _ in range(60):
                    cached = sql(f"select provider || ':' || is_demo::text from public.content_ai_cache where original_url = '{url}'")
                    if cached:
                        break
                    time.sleep(0.5)
                assert cached == "mock:true", f"백그라운드 번역 미생성: {cached!r}"

                page.goto(f"{BASE}/trending?period=weekly&limit=50")
                card = page.locator("article", has=page.get_by_text(f"원문: {title}"))
                expect(card.get_by_role("button", name=f"[DEMO 번역] {title}")).to_be_visible()
                expect(card.get_by_text("DEMO 번역", exact=True)).to_be_visible()
                expect(card.get_by_text("시사점", exact=True)).to_be_visible()
                expect(card.get_by_role("link", name="Agentic AI", exact=True)).to_be_visible()

                # 주제 상세·Saved Posts·Knowledge Base 도 같은 번역 표시 (저장은 SQL 로 준비 후 정리)
                sql(
                    "insert into public.saved_posts (user_id, content_id, in_knowledge_base) "
                    f"select user_id, id, true from public.content_items where original_url = '{url}'"
                )
                topic_id = sql(f"select t.id from public.topics t join public.profiles p on p.id = t.user_id where p.email = '{EMAIL}' and t.name = 'Agentic AI'")
                try:
                    for path in [f"/topics/{topic_id}", "/saved", "/knowledge"]:
                        page.goto(f"{BASE}{path}")
                        expect(page.get_by_role("switch", name="한국어로 보기")).to_be_visible()
                        expect(page.get_by_role("button", name=f"[DEMO 번역] {title}").first).to_be_visible()
                    # 번역 제목으로 검색
                    page.goto(f"{BASE}/saved?q=" + urllib.parse.quote("DEMO 번역"))
                    expect(page.get_by_role("button", name=f"[DEMO 번역] {title}").first).to_be_visible()
                finally:
                    sql(f"delete from public.saved_posts where content_id in (select id from public.content_items where original_url = '{url}')")

                # 번역 끄기 → 원문 제목
                page.goto(f"{BASE}/trending?period=weekly&limit=50")
                page.get_by_role("switch", name="한국어로 보기").click()
                page.wait_for_timeout(800)
                page.reload()
                expect(page.get_by_role("button", name=title, exact=True)).to_be_visible()
                expect(page.get_by_text(f"원문: {title}")).to_have_count(0)
                page.get_by_role("switch", name="한국어로 보기").click()
                page.wait_for_timeout(800)
                assert sql(f"select translate_ko::text from public.profiles where email = '{EMAIL}'") == "true"

                # 조건 없음: 전체 흐름은 Dashboard → 요약 반복·AI 시사점 생성 없음, 키워드로 분석 시작 안내
                page.reload()
                expect(page.get_by_text("조건별 트렌드 분석")).to_be_visible()
                expect(page.get_by_role("button", name="AI 시사점 생성")).to_have_count(0)
                expect(page.get_by_label("오늘의 AI 인사이트 (Daily Briefing)")).to_be_visible()
                # 조건(키워드) 선택 시: 조건 내 변화·함께 등장한 키워드·출처 분포 + AI 시사점(허용 콘텐츠만)
                page.goto(f"{BASE}/trending?period=weekly&limit=50&kw=agentic%20ai")
                expect(page.get_by_text(re.compile(r"트렌드 시사점 · 키워드: #agentic ai"))).to_be_visible()
                expect(page.get_by_text("급상승 키워드")).to_be_visible()
                expect(page.get_by_role("list", name="조건 내 출처 분포")).to_be_visible()
                page.get_by_role("button", name="AI 시사점 생성").click()
                expect(page.get_by_text(re.compile(r"트렌드 시사점을 생성했습니다 \(콘텐츠 1건 분석\)"))).to_be_visible(timeout=60000)
                expect(page.get_by_text(re.compile(r"^\[DEMO\] 인기 콘텐츠 1건 기반"))).to_be_visible()
                page.screenshot(path=f"{SHOTS}/trending-insights.png", full_page=True)
            finally:
                # 차단 복원 → 번역·시사점 삭제
                page.goto(f"{BASE}/settings")
                sw = page.get_by_role("switch", name="E2E AI Source AI 번역·요약 차단")
                try:
                    sw.wait_for(timeout=10000)
                    sw.click()
                    expect(page.get_by_text(re.compile("'E2E AI Source'의 AI 처리를 차단하고"))).to_be_visible(timeout=60000)
                except Exception:
                    # UI 정리에 실패해도 공유 로컬 DB 상태는 반드시 원복
                    sql(f"update public.data_sources set ai_processing_allowed = false, external_llm_allowed = false where id = {src}")
                    sql(f"update public.content_items set ai_processing_allowed = false, external_llm_allowed = false, ai_processing_status = 'blocked' where source_id = {src} and provenance = 'collected'")
                    sql(f"delete from public.content_ai_cache where source_id = {src}")
                    raise
            assert sql(f"select count(*) from public.content_ai_cache where original_url = '{url}'") == "0"
            assert sql("select ai_processing_allowed::text from public.data_sources where slug = 'e2e-ai-source' and user_id is null") == "false"
            sql("delete from public.data_sources where slug = 'e2e-ai-source' and user_id is null")

        check("소스 on/off·Statistics·운영자 AI 허용·번역 토글·트렌드 시사점", sources_stats_insights)

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
            # 소스별 사이트·수집 주소 링크 (새 탭)
            site = page.get_by_role("link", name="Hacker News 사이트 열기 (새 탭)")
            expect(site).to_have_attribute("href", re.compile(r"^https://news\.ycombinator\.com"))
            expect(site).to_have_attribute("target", "_blank")
            expect(page.get_by_role("link", name="Hugging Face Daily Papers 수집 주소 열기 (새 탭)")).to_have_attribute("href", "https://huggingface.co/api/daily_papers")
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
                art = page.locator("article", has=page.get_by_role("button", name=hit))
                expect(art).to_be_visible()
                expect(art.get_by_role("img", name="RSS 로고")).to_be_visible()
                expect(art.get_by_text("E2E Fixture Feed")).to_be_visible()
                expect(page.get_by_role("button", name=miss)).to_have_count(0)

                # 주제 연결 (Agentic AI)
                page.goto(f"{BASE}/topics")
                page.get_by_role("link", name="Agentic AI", exact=True).click()
                expect(page.get_by_role("button", name=hit)).to_be_visible()

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
