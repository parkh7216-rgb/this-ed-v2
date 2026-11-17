// Firebase 설정값 두 개를 따옴표 안에 붙여넣으세요. 비워 두면 '코드 교환' 방식의 친구 기능이 쓰여요.
window.MC_FB={apiKey:"AIzaSyBH3dMF76fcKAet-_oGRxrwtfkD-AlA2xE",projectId:"appmade-cf539"};
// Pages에서는 공개 Manus API를 호출하고, Manus Preview·게시 앱에서는 상대 /api를 사용합니다.
window.MC_API_BASE_URL = window.location.origin === 'https://parkh7216-rgb.github.io'
  ? 'https://thised-haw6abzs.manus.space'
  : '';
