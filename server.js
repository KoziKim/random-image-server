// 필요한 도구들을 가져와요
require("dotenv").config(); // 환경 변수 로드
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const FormData = require("form-data");

// 환경 변수 설정 (배포 환경을 위한 설정)
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ""; // 실제 배포 시 환경 변수로 설정

// 서버 만들기
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 메인 페이지 만들기
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>랜덤 이미지 다운로더</title>
        <style>
          body { font-family: Arial; text-align: center; margin-top: 50px; }
          h1 { color: #333; }
          .form { margin: 30px auto; max-width: 500px; }
          input { padding: 10px; margin: 10px; width: 100px; }
          button { 
            background: #4CAF50; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            cursor: pointer;
            border-radius: 5px;
          }
        </style>
      </head>
      <body>
        <h1>랜덤 이미지 다운로더</h1>
        <div class="form">
          <p>원하는 이미지 크기를 입력하세요:</p>
          <div>
            <input type="number" id="width" value="1080" placeholder="너비">
            <input type="number" id="height" value="1080" placeholder="높이">
          </div>
          <button onclick="downloadImage()">이미지 다운로드</button>
        </div>
        
        <script>
          function downloadImage() {
            const width = document.getElementById('width').value || 1080;
            const height = document.getElementById('height').value || 1080;
            window.location.href = \`/api/random-image?width=\${width}&height=\${height}\`;
          }
        </script>
      </body>
    </html>
  `);
});

// 이미지 가져오는 주소 만들기
app.get("/api/random-image", async (req, res) => {
  try {
    // 사용자가 원하는 크기 확인하기
    const width = req.query.width || 1080;
    const height = req.query.height || 1080;

    // 랜덤 이미지 주소 만들기
    const imageUrl = `https://picsum.photos/${width}/${height}?random=${Math.floor(
      Math.random() * 1000
    )}`;

    console.log(`이미지를 가져오고 있어요: ${imageUrl}`);

    // 이미지 가져오기
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.buffer();

    // 이미지 보내주기
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="random-${Date.now()}.jpg"`
    );
    res.send(imageBuffer);
  } catch (error) {
    console.error("에러 발생:", error);
    res.status(500).send("이미지를 가져오다가 문제가 생겼어요 :(");
  }
});

// 슬랙 슬래시 명령어 처리 엔드포인트
app.post("/api/slack-command", async (req, res) => {
  try {
    // 슬랙에서 보낸 데이터 확인
    const { text, response_url, channel_id } = req.body;

    // 기본 이미지 크기 설정
    let width = 500;
    let height = 500;

    // 사용자가 크기를 입력했는지 확인
    if (text && text.trim()) {
      const dimensions = text.split(" ");
      if (dimensions.length >= 1) width = parseInt(dimensions[0]) || 500;
      if (dimensions.length >= 2) height = parseInt(dimensions[1]) || 500;
    }

    // 즉시 응답 (슬랙 타임아웃 방지)
    res.status(200).send({
      response_type: "in_channel",
      text: `${width}x${height} 크기의 랜덤 이미지를 생성 중입니다...`,
    });

    try {
      // 이미지 URL 생성
      const imageUrl = `https://picsum.photos/${width}/${height}?random=${Math.floor(
        Math.random() * 1000
      )}`;

      // 이미지 가져오기
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.buffer();

      // 슬랙 토큰 확인
      if (SLACK_BOT_TOKEN) {
        // FormData 객체 생성
        const formData = new FormData();
        formData.append("file", imageBuffer, {
          filename: `random-${Date.now()}.jpg`,
        });
        formData.append("channels", channel_id);
        formData.append(
          "initial_comment",
          `${width}x${height} 크기의 랜덤 이미지입니다`
        );

        // 슬랙 API를 사용하여 파일 업로드
        const uploadResponse = await fetch(
          "https://slack.com/api/files.upload",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
            },
            body: formData,
          }
        );

        const uploadResult = await uploadResponse.json();
        if (!uploadResult.ok) {
          throw new Error(`슬랙 파일 업로드 오류: ${uploadResult.error}`);
        }
      } else {
        // 토큰이 없는 경우 일반 메시지로 대체
        await fetch(response_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            response_type: "in_channel",
            text: `${width}x${height} 크기의 랜덤 이미지입니다: ${imageUrl}`,
          }),
        });
      }
    } catch (error) {
      console.error("이미지 처리 오류:", error);
      // 오류 발생 시 메시지 업데이트
      if (response_url) {
        await fetch(response_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            response_type: "in_channel",
            text: "이미지를 생성하는 중에 문제가 발생했습니다 :(",
          }),
        });
      }
    }
  } catch (error) {
    console.error("슬랙 명령어 처리 오류:", error);
    // 오류가 발생해도 슬랙에는 200 응답을 보내야 함
    if (!res.headersSent) {
      res.status(200).send({
        response_type: "ephemeral",
        text: "이미지를 생성하는 중에 문제가 발생했습니다 :(",
      });
    }
  }
});

// 서버 시작하기
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행 중이에요!`);
  console.log(`웹 브라우저에서 http://localhost:${PORT} 주소로 접속해보세요!`);
});
