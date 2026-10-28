/**
 * 단일 HTML 파일 번들러 (오프라인 배포용)
 * src 폴더 내의 분할된 CSS 및 JS 파일들을 읽어 하나의 독립된 HTML 파일로 통합합니다.
 * 외부 라이브러리/종속성 없이 순수 Node.js 기본 내장 모듈만으로 동작합니다.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const ENTRY_HTML = path.join(SRC_DIR, 'index.html');
const OUTPUT_HTML = path.join(DIST_DIR, 'index.html');
const STANDALONE_COPY = path.join(__dirname, '경품추첨_돌림판_단일파일.html');

function bundle() {
    console.log('🚀 단일 HTML 빌드 시작...');

    if (!fs.existsSync(ENTRY_HTML)) {
        console.error(`❌ 진입 파일이 존재하지 않습니다: ${ENTRY_HTML}`);
        process.exit(1);
    }

    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
    }

    let html = fs.readFileSync(ENTRY_HTML, 'utf8');

    // 1. CSS 파일 인라인 치환
    const cssLinkRegex = /<link\s+rel=["']stylesheet["']\s+href=["']([^"']+)["']\s*\/?>/gi;
    html = html.replace(cssLinkRegex, (match, href) => {
        const cssPath = path.join(SRC_DIR, href);
        if (fs.existsSync(cssPath)) {
            console.log(`  [CSS 포함] ${href}`);
            const cssContent = fs.readFileSync(cssPath, 'utf8');
            return `<style>\n/* === ${href} === */\n${cssContent}\n</style>`;
        } else {
            console.warn(`  ⚠️ CSS 파일을 찾을 수 없습니다: ${cssPath}`);
            return match;
        }
    });

    // 2. JS 파일 인라인 치환
    const scriptRegex = /<script\s+src=["']([^"']+)["']\s*><\/script>/gi;
    html = html.replace(scriptRegex, (match, src) => {
        const jsPath = path.join(SRC_DIR, src);
        if (fs.existsSync(jsPath)) {
            console.log(`  [JS 포함] ${src}`);
            const jsContent = fs.readFileSync(jsPath, 'utf8');
            return `<script>\n// === ${src} ===\n${jsContent}\n</script>`;
        } else {
            console.warn(`  ⚠️ JS 파일을 찾을 수 없습니다: ${jsPath}`);
            return match;
        }
    });

    // 3. dist/index.html 및 루트 경품추첨_돌림판_단일파일.html로 저장
    fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
    fs.writeFileSync(STANDALONE_COPY, html, 'utf8');

    const stats = fs.statSync(OUTPUT_HTML);
    console.log(`\n✅ 빌드 완료!`);
    console.log(`   - 산출물 경로: ${OUTPUT_HTML}`);
    console.log(`   - 바로실행 복사본: ${STANDALONE_COPY}`);
    console.log(`   - 파일 크기: ${(stats.size / 1024).toFixed(2)} KB`);
    console.log(`   - 이제 더블클릭만으로 인터넷 없이 모든 브라우저에서 바로 사용 가능합니다.\n`);
}

bundle();
