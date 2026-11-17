# 우리 국어하자

맞춤법 조항별 연습, 지문 학습, 사용자가 직접 입력하거나 사진으로 넣은 지문으로 만드는 AI 독해 문제를 제공하는 웹 앱입니다.

## 실행

Node.js 22 이상에서 프로젝트 폴더로 이동한 뒤 `node server.js`를 실행하세요. 기본 포트는 `3000`이며 `PORT` 환경 변수로 바꿀 수 있습니다.

AI 문제 생성을 쓰려면 서버 실행 환경에 `MANUS_API_URL`과 `MANUS_API_KEY`를 설정해야 합니다. 키 값은 소스 코드나 저장소에 넣지 마세요. API 서버는 사용자가 추가한 지문만 근거로 고난도 5지선다 독해 문항 5개와 근거·해설을 생성하도록 설계되어 있습니다. `내꺼`에서는 지문을 입력하거나 JPEG·PNG·WebP 사진(원본 최대 20MB)을 사용할 수 있습니다. 브라우저가 이미지를 열어 긴 변 2,600px 이하의 JPEG로 변환하고 4MB 이하로 축소한 뒤, 서버가 형식·컨테이너 구조·해상도를 다시 확인합니다. 이미지는 문제 생성 요청 때만 전송되며 서버에 보관하지 않습니다. 이미지에서 읽은 지문과 생성 문제는 브라우저의 이 기기 저장소에 남습니다.

## 검사

```bash
node --check app.js
node --check server.js
node --test tests/server.test.js
```

## 자료 추가

교재 지문은 원문을 받은 뒤에만 `지문` 자료로 추가합니다. 원문이 오기 전에는 임의의 지문을 넣지 않습니다. 맞춤법 조항·보기형 문제는 `맞춤법` 학습에 포함됩니다.

## 배포 참고

이 앱의 AI 문제 생성은 Node.js 서버의 `POST /api/generate`를 사용합니다. GitHub Pages는 정적 파일만 제공하므로 공개 페이지는 [Manus Node.js API](https://thised-haw6abzs.manus.space)의 `/api/generate`를 호출합니다. 백엔드는 `/api/health`와 `/api/generate`를 제공하고 `https://parkh7216-rgb.github.io` origin만 CORS로 허용합니다. API 자격 증명은 서버 런타임에서만 사용하며 브라우저 설정과 공개 저장소에 넣지 않습니다. Manus Preview와 게시 앱은 자체 서버의 상대 `/api` 경로를 사용합니다. GitHub 저장소에 코드를 올리는 것만으로 Node.js 서버가 배포되지는 않으므로, Manus 컨테이너 게시와 Pages 갱신이 각각 필요합니다.
