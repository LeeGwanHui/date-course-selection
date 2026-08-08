/* docs/app.js는 <script src>로 로드되는 무빌드 전역 스크립트라 import가 안 된다.
   ESM으로 바꾸면 서비스워커 프리캐시와 얽히므로, 프로덕션 코드는 그대로 두고
   node:vm에 최소 DOM 스텁을 깔아 통째로 평가한 뒤 순수 함수를 꺼내 쓴다. */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = new URL("../docs/app.js", import.meta.url);

export function loadApp() {
  const el = { innerHTML: "" };
  const ctx = {
    document: { title: "", getElementById: () => el, addEventListener() {} },
    window: { addEventListener() {} },
    location: { hash: "", search: "" },
    history: { pushState() {} },
    navigator: {},                    // serviceWorker 없음 → SW 등록 분기 안 탐
    URLSearchParams,
    TextDecoder,
    console,
    // app.js 하단의 main()이 즉시 돌면서 index.json을 부른다.
    // location이 기본값(빈 hash/search)이면 홈 라우트를 타는데, 거기는 index.json
    // fetch 실패를 자체 try{}catch{}로 삼켜 빈 아카이브를 그린다(오류 화면 아님).
    // #frag / ?c= / ?f= 라우트는 바깥 catch로 올라가 오류 화면이 뜬다.
    // 테스트는 함수를 직접 호출하므로 어느 쪽이든 실행에 지장은 없다.
    fetch: async () => { throw new Error("no network in tests"); },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(SRC, "utf8"), ctx);
  ctx.__el = el;
  return ctx;
}

/* vm 컨텍스트는 자기만의 Array 인트린식을 갖는다. 그 안에서 만들어진 배열은
   구조가 같아도 deepStrictEqual을 통과하지 못한다(프로토타입이 다르다).
   vm에서 나온 값은 이걸로 테스트 realm으로 옮겨서 비교한다. */
export const plain = (v) => JSON.parse(JSON.stringify(v));
