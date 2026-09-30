#!/usr/bin/env python3
"""Lint Korean articles for translationese (번역투), AI-sounding patterns, house style
and glossary violations.

Usage:
    python ko_lint.py FILE_OR_DIR [...] [--glossary glossary.json] [--quiet] [--json]

Rules carry a severity:
    error  must be fixed before publishing (exit code 1)
    warn   usually wrong in news prose; fix unless there is a reason
    info   density signals; look at the sentence

Quoted speech ("…", “…”) and code/URLs are excluded from grammar rules, since
quotes keep the speaker's words. Wikilink targets ([[Target|별칭]]) are ignored;
only the alias is checked.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

FM_RE = re.compile(r"^---\r?\n(.*?)\r?\n---\r?\n?", re.S)
WIKI_RE = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]")
QUOTE_RE = re.compile(r"\"[^\"\n]*\"|“[^”\n]*”|‘[^’\n]*’")
URL_RE = re.compile(r"https?://\S+|`[^`]*`")

LATIN_ALLOW = {
    "FC", "VAR", "xG", "xGA", "PK", "PO", "MVP", "K", "U", "AFC", "ACL", "KFA", "TV", "SNS", "VS", "vs",
    "SPOTV", "OTT", "YouTube", "Coupang", "Play", "CPL", "EPL", "K1", "K2", "K3", "K4", "Seoul", "E-Land",
    "Digest", "GK", "DF", "MF", "FW", "AM", "RB", "LB", "CB", "DM", "CM", "AM", "RW", "LW", "ST", "OK",
    "HD", "BNK", "iM", "DGB", "Hana", "KEB", "Leoul", "Park", "DRX", "IPark", "VIP", "SNS", "CU",
}

@dataclass
class Rule:
    id: str
    severity: str
    pattern: re.Pattern
    message: str
    max_count: int = 0          # >0: only report when the file has more than this many hits
    per_1000: float = 0.0       # >0: only report when hits per 1,000 Hangul chars exceed this
    in_quotes: bool = False     # also scan quoted speech
    hits: list = field(default_factory=list)


def R(id, sev, pat, msg, **kw) -> Rule:
    return Rule(id, sev, re.compile(pat, re.M), msg, **kw)


RULES: list[Rule] = [
    # Grammar and translationese
    R("double-passive", "error", r"되어지|되어진|되어져|되어졌|되어질|지게 되|잊혀지|쓰여지|보여지|불려지", "이중 피동: '되다/지다'를 한 번만 쓴다 (예: 여겨진다 → 여긴다/보인다)"),
    R("by-agent", "warn", r"에 의해(서)?\s", "'~에 의해' 피동은 능동으로 (예: 심판에 의해 취소됐다 → 비디오 판독 끝에 취소됐다)"),
    R("she", "error", r"그녀", "'그녀'는 쓰지 않는다: 이름이나 직함으로"),
    R("they", "warn", r"그들(은|이|의|을|를|에게|과|와|도|만)", "'그들'은 번역투: 팀 이름, '선수들', '두 팀' 등으로", max_count=0),
    R("pronoun-he", "warn", r"(?<![가-힣])(그는|그가|그를|그의|그에게(?:서)?(?:는|도|만)?|그와(?:는|도)?)(?=[\s,.!?)])",
      "3인칭 대명사 '그'는 번역투: 이름을 다시 쓰거나 주어를 생략 (파일당 1회까지 허용)", max_count=1),
    R("niitseo", "warn", r"(에|에게) 있어(서)?\s", "'~에 있어서'는 번역투: '~에서', '~에게는' 등으로"),
    R("have-game", "warn", r"(경기|맞대결|훈련|기자회견|시간)(을|를)\s?(가졌|가진|가지|갖는|갖게|갖고|갖기)", "'경기를 가졌다'는 번역투: '경기를 치렀다', '맞붙었다'"),
    R("have-verb", "info", r"(을|를)\s?(가지고 있|갖고 있|가진다|갖는다)", "'가지다' 남용 여부 확인: '있다', '지니다', '보유하다' 등", max_count=1),
    R("important-to", "warn", r"하는 것이 (중요|필요|관건)", "'~하는 것이 중요하다'는 AI·번역투: '~해야 한다', '관건은 ~다'"),
    R("from", "info", r"로부터", "'~로부터' 확인: '~에게서', '~에서'가 자연스러운 경우가 많다", max_count=1),
    R("about", "info", r"에 대(해|한|하여|해서)", "'~에 대해/대한' 과다", per_1000=2.5),
    R("not-only", "warn", r"뿐만 아니라", "'뿐만 아니라' 반복은 AI 문체 신호", max_count=1),
    R("also-start", "warn", r"(^|[.!?]\s+)또한[, ]", "문장 첫머리 '또한' 반복", max_count=2),
    R("summary-connector", "warn", r"결론적으로|요약하자면|이처럼|이와 같이|요컨대|종합하면", "요약·결론 접속어는 AI 문체 신호: 빼거나 구체적인 문장으로"),
    R("various", "info", r"다양한", "'다양한' 남용: 구체적으로 무엇인지 쓴다", max_count=2),
    R("key-role", "warn", r"중요한 역할|핵심적인 역할", "'중요한 역할을 했다'는 상투 표현: 무엇을 했는지 쓴다"),
    R("can-do", "info", r"할 수 있(다|었다|을 것)", "'~할 수 있다' 남용", per_1000=3.0),
    R("ing", "info", r"(하는|되는) 중이다", "'~하는 중이다' 확인: '~하고 있다'", max_count=0),
    R("intensifier", "info", r"(^|\s)(매우|정말|굉장히|엄청|너무나)\s", "강조 부사 남용", max_count=3),
    R("through", "info", r"(을|를) 통해(서)?\s", "'~을 통해' 남용 확인", max_count=3),
    R("jeok", "info", r"[가-힣]{2,}적(인|으로)\s", "'~적인/적으로' 남용", per_1000=6.0),
    R("with", "info", r"와 함께|과 함께", "'~와 함께' 남용 확인", max_count=3),
    R("plural", "info", r"(팬|선수|코치|상대|수비수|공격수)들(이|은|을|의|과|도)", "'~들' 복수 남용 확인", max_count=6),
    R("double-passive-2", "error", r"보여(지[가-힣]*|진[가-힣]*|졌[가-힣]*|져[가-힣]*)|불리워(지|진|졌|져)", "이중 피동: '보이다/불리다'로", in_quotes=True),
    R("despite", "info", r"(에도|임에도)\s*불구하고", "'~에도 불구하고'는 대개 '~에도', '~인데도'로 줄인다", max_count=1),
    R("deouk-deo", "warn", r"더욱\s*더(?![가-힣])", "'더욱 더'는 중복: '더욱' 또는 '더'"),
    R("first-second-third", "warn", r"첫째,?.{0,80}둘째,?.{0,80}셋째", "'첫째, 둘째, 셋째' 나열은 기사 문체가 아니다"),
    R("ascii-ellipsis", "warn", r"\.\.\.", "줄임표는 '…'", in_quotes=True),
    R("spaced-compound", "error", r"페널티\s+킥|프리\s+킥|해트\s+트릭|코너\s+킥|스루\s+패스|세컨드\s+볼|스리\s+백|포\s+백(?![가-힣])", "붙여 쓰는 축구 용어 (페널티킥, 프리킥, 해트트릭, 코너킥, 스루패스, 세컨드볼, 스리백, 포백)", in_quotes=True),
    R("single-quote-speech", "warn", r"'[^'\n]{4,80}'(?:라고|고|하고)\s*(말했다|밝혔다|전했다|했다|강조했다)", "직접 인용은 큰따옴표(\" \")", in_quotes=True),
    R("hedge", "info", r"것으로\s*(보인다|예상된다|전망된다|알려졌다)", "추측 표현: 사실이면 단정하고, 아니면 출처를 밝힌다", max_count=2),
    R("animate-robuteo", "warn", r"(선수|감독|동료|코치|주장|팬)(들)?(으)?로부터", "사람 뒤 '로부터'는 '에게서'"),
    R("predictable", "info", r"예측\s*가능한", "'예측 가능한' → '예상된', '뻔한'"),
    R("cleft", "info", r"(했던|한)\s*것은\s*.{0,15}?이었다", "'~한 것은 ~이었다' 강조 구문 남용 확인", max_count=1),
    R("house-club-name", "error", r"서울이랜드|이랜드FC|서울 이랜드FC", "구단명 표기: '서울 이랜드' / '서울 이랜드 FC'", in_quotes=False),
    R("house-threeback", "warn", r"쓰리백|쓰리톱|포백라인", "표기: 스리백, 스리톱, 포백 라인"),
    # Register: news prose is 해라체 (-다) outside quotes
    R("polite-ending", "error", r"(습니다|습니까|합니다|입니다|해요|에요|예요|하세요|드립니다|거든요|네요|죠)[.!?]?(\s|$)", "기사 본문은 '-다' 체: 존댓말 어미가 인용 밖에 있다"),
    # Punctuation and typography
    R("em-dash", "warn", r"—|–", "줄표(—, –)는 한국 기사에서 거의 쓰지 않는다: 쉼표, 괄호, 문장 분리로", max_count=0),
    R("colon-prose", "info", r"[가-힣]:\s[가-힣]", "문장 중간 쌍점(:) 확인", max_count=2),
    R("semicolon", "warn", r";", "쌍반점(;)은 한국어 기사에서 쓰지 않는다"),
    R("space-before-punct", "error", r"[가-힣0-9]\s+[,.!?](\s|$)", "문장부호 앞 공백"),
    R("points-space", "error", r"승점\d", "'승점 3'처럼 띄운다"),
    R("unit-space", "warn", r"(?<![\d\-:.])\d+\s(연승|연패|연속|골|도움|경기|위|라운드|분|초|명|번째|호|승|무|패|개|회|세|살)(?=[\s,.!?)]|이|을|를|의|은|는|에|째|으로|로|과|와|도|만|까지|부터|$)", "숫자와 단위는 붙여 쓴다 (예: 3연승, 29분, 6,105명)"),
    R("range-dash", "info", r"\d\s?[-–]\s?\d+\s?(분|일|월|라운드|위)", "범위는 물결표(~): '26~34라운드' (스코어가 아니면 확인)"),
    R("latin-word", "warn", r"(?<![A-Za-z0-9_/.\-])[A-Za-z][A-Za-z'’\-]{2,}(?![A-Za-z0-9_])", "한글 본문에 남은 로마자 단어 (고유명사 표기 확인)"),
    # English football idioms and abstract nouns carried over literally (found by the desk editors)
    R("calque-fresh-legs", "warn", r"새\s?다리", "'새 다리'(fresh legs)는 직역: '활동량', '체력이 남은 선수', '교체 카드', '활력'"),
    R("calque-spine", "warn", r"척추", "'척추'(spine) 비유는 직역: '중심축', '뼈대', '센터라인'"),
    R("calque-heart", "warn", r"심장(?!박|병|마비)", "'~의 심장'(the heart of) 비유는 번역투: '핵심', '중심', '공격의 핵'"),
    R("calque-question", "warn", r"질문(은|이다|이었다|이 된|으로 남|이 남|을 던|이 던져)", "'질문'(question)은 직역: '과제', '관건', '물음표', '문제'"),
    R("calque-headline", "warn", r"헤드라인", "'헤드라인'은 직역: '눈에 띄는', '결정적인', '화제의'"),
    R("calque-clinical", "error", r"임상", "'임상적인'(clinical)은 직역: '냉정한', '침착한', '효율적인'"),
    R("calque-abstract", "warn", r"층위|결합 조직|성격 검사|인성 검사|캐릭터 테스트", "추상 명사·관용구 직역: 구체적인 축구 표현으로 (예: 성격 검사 → 맷집을 확인하는 경기)"),
    R("calque-signature", "info", r"시그니처", "'시그니처'는 외래어 남용: '전매특허', '트레이드마크', '특유의'"),
    R("calque-magic", "info", r"마법", "'마법'(magic) 확인: '한 방', '번뜩임', '개인기'"),
    R("calque-reward", "info", r"보상(했다|하는|받았|받은|받을|을 받)", "'보상받다'(rewarded) 확인: '결실을 봤다', '빛을 봤다', '성과로 이어졌다'"),
    R("calque-pronoun-it", "info", r"(^|[.!?]\s+)(그것|이것)(이|은|을)\s", "문장 첫머리 '그것/이것'은 번역투: 가리키는 대상을 쓰거나 생략", max_count=1),
]

# Particle agreement (조사 호응): 받침 decides 을/를, 은/는, 이/가, 과/와.
PARTICLE_RE = re.compile(r"((?<![A-Za-z0-9])\d*\d|[가-힣])(을|를|은|는|이|가|과|와)(?=[\s,.!?)\]…·'\"”’]|$)", re.M)
DIGIT_BATCHIM = {"0": True, "1": True, "2": False, "3": True, "4": False, "5": False,
                 "6": True, "7": True, "8": True, "9": False}
# Words that legitimately end in a vowel syllable + 을 (가을, 마을, ㅅ-irregular verb forms)
EUL_WORDS = {"가을", "마을", "고을", "나을", "이을", "지을", "부을", "그을", "저을"}


def has_batchim(ch: str) -> bool:
    code = ord(ch) - 0xAC00
    return 0 <= code <= 11171 and code % 28 != 0


def strip_for_scan(text: str, keep_quotes: bool) -> str:
    # Replacements never contain newlines, so line numbers survive.
    text = URL_RE.sub("〃", text)
    text = WIKI_RE.sub(lambda m: m.group(2) or m.group(1), text)
    if not keep_quotes:
        text = QUOTE_RE.sub("〃", text)
    return text


def lint_text(path: Path, raw: str, glossary: dict | None) -> list[dict]:
    fm = FM_RE.match(raw)
    offset_lines = raw[: fm.end()].count("\n") if fm else 0
    body = raw[fm.end():] if fm else raw
    findings: list[dict] = []
    hangul = max(1, len(re.findall(r"[가-힣]", body)))
    scan_nq = strip_for_scan(body, keep_quotes=False)
    scan_q = strip_for_scan(body, keep_quotes=True)
    table_lines = {i for i, l in enumerate(body.splitlines()) if l.strip().startswith("|")}

    for rule in RULES:
        text = scan_q if rule.in_quotes else scan_nq
        hits = []
        for m in rule.pattern.finditer(text):
            line_no = text.count("\n", 0, m.start())
            if rule.id == "latin-word":
                word = m.group(0).strip("'’-")
                if word in LATIN_ALLOW or word.upper() in LATIN_ALLOW:
                    continue
            if rule.id in ("unit-space", "range-dash") and line_no in table_lines:
                continue
            src_lines = body.splitlines()
            line = src_lines[line_no] if line_no < len(src_lines) else ""
            hits.append({"line": line_no + 1 + offset_lines, "match": m.group(0).strip(), "context": line.strip()[:120]})
        n = len(hits)
        if not n:
            continue
        if rule.max_count and n <= rule.max_count:
            continue
        if rule.per_1000 and n * 1000 / hangul <= rule.per_1000:
            continue
        for h in hits:
            findings.append({"file": str(path), "rule": rule.id, "severity": rule.severity, "message": rule.message, **h})

    for m in PARTICLE_RE.finditer(scan_nq):
        prev, particle = m.group(1)[-1], m.group(2)
        if prev.isdigit():
            batchim = DIGIT_BATCHIM[prev]
            wrong = (batchim and particle in "는를가와") or (not batchim and particle in "은을이과")
        else:
            batchim = has_batchim(prev)
            wrong = (batchim and particle in "를와") or (not batchim and particle == "을" and prev + particle not in EUL_WORDS)
        if wrong:
            ln = scan_nq.count("\n", 0, m.start())
            findings.append({"file": str(path), "rule": "particle", "severity": "error",
                             "message": f"조사 호응: '{prev}{particle}' (받침 {'있음' if batchim else '없음'})",
                             "line": ln + 1 + offset_lines, "match": prev + particle,
                             "context": body.splitlines()[ln].strip()[:120]})

    verbs = re.findall(r"(?:\"|”)\s*(?:라고|고|며|면서|라며)\s*(말했다|밝혔다|전했다|강조했다|덧붙였다|설명했다|답했다|했다|털어놓았다|다짐했다)", body)
    if len(verbs) >= 4:
        top = max(set(verbs), key=verbs.count)
        if verbs.count(top) / len(verbs) > 0.7:
            findings.append({"file": str(path), "rule": "quote-verb-monotony", "severity": "info",
                             "message": f"인용 동사 '{top}'가 {verbs.count(top)}/{len(verbs)}회: 밝혔다·강조했다·덧붙였다 등으로 변주",
                             "line": 1, "match": top, "context": ""})

    if glossary:
        plain = strip_for_scan(body, keep_quotes=True)
        for wrong, right in glossary.get("wrong_forms", {}).items():
            for m in re.finditer(re.escape(wrong), plain):
                ln = plain.count("\n", 0, m.start())
                findings.append({"file": str(path), "rule": "glossary", "severity": "error",
                                 "message": f"'{wrong}' → '{right}'", "line": ln + 1 + offset_lines,
                                 "match": wrong, "context": body.splitlines()[ln].strip()[:120]})
        for en_name, ko_name in glossary.get("names", {}).items():
            for m in re.finditer(rf"(?<![A-Za-z]){re.escape(en_name)}(?![A-Za-z])", strip_for_scan(body, keep_quotes=True)):
                ln = plain.count("\n", 0, m.start())
                findings.append({"file": str(path), "rule": "english-name", "severity": "error",
                                 "message": f"영문 이름 '{en_name}' → '{ko_name}'", "line": ln + 1 + offset_lines,
                                 "match": en_name, "context": body.splitlines()[ln].strip()[:120]})

    if fm:
        for key in ("title", "description"):
            m = re.search(rf"^{key}:\s*(.+)$", fm.group(1), re.M)
            if m and not re.search(r"[가-힣]", m.group(1)):
                findings.append({"file": str(path), "rule": "frontmatter", "severity": "error",
                                 "message": f"{key} is not Korean", "line": 1, "match": key, "context": m.group(1)[:120]})
            if m and re.search(r"(습니다|입니다|해요)", m.group(1)):
                findings.append({"file": str(path), "rule": "frontmatter", "severity": "warn",
                                 "message": f"{key}: 존댓말 어미", "line": 1, "match": key, "context": m.group(1)[:120]})
    return findings


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--glossary", help="JSON with {'names': {EN: KO}, 'wrong_forms': {wrong: right}}")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--quiet", action="store_true", help="only errors and warnings")
    a = ap.parse_args()
    glossary = json.loads(Path(a.glossary).read_text(encoding="utf-8")) if a.glossary else None
    files: list[Path] = []
    for p in map(Path, a.paths):
        files += sorted(p.rglob("*.md")) if p.is_dir() else [p]
    all_findings = []
    for f in files:
        all_findings += lint_text(f, f.read_text(encoding="utf-8"), glossary)
    if a.json:
        print(json.dumps(all_findings, ensure_ascii=False, indent=1))
    else:
        by_file: dict[str, list] = {}
        for x in all_findings:
            if a.quiet and x["severity"] == "info":
                continue
            by_file.setdefault(x["file"], []).append(x)
        for f, xs in by_file.items():
            print(f"== {Path(f).name}")
            for x in sorted(xs, key=lambda x: (x["severity"] != "error", x["line"])):
                print(f"  {x['severity']:5} L{x['line']:<4} {x['rule']:<18} {x['match'][:24]!r:28} {x['context'][:90]}")
        errs = sum(1 for x in all_findings if x["severity"] == "error")
        warns = sum(1 for x in all_findings if x["severity"] == "warn")
        infos = sum(1 for x in all_findings if x["severity"] == "info")
        print(f"\n{len(files)} file(s): {errs} error(s), {warns} warning(s), {infos} info")
    return 1 if any(x["severity"] == "error" for x in all_findings) else 0


if __name__ == "__main__":
    sys.exit(main())
