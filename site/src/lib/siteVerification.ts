// Search-engine ownership tokens, rendered as <meta> tags on every page.
// Paste only the content value of each tag. Empty strings render nothing.
// - Naver Search Advisor: 사이트 관리 → 사이트 등록 → HTML 태그 (naver-site-verification)
// - Bing Webmaster Tools: meta tag option (msvalidate.01); importing from Google Search Console also works
// - Google Search Console: the Domain property is verified by the DNS TXT record, so this stays empty
export const SITE_VERIFICATION = {
  naver: "",
  bing: "",
  google: "",
} as const;
