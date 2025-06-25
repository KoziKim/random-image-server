// 필요한 도구들을 가져와요
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

// 서버 만들기
const app = express();
app.use(cors());
app.use(express.json());

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

// 서버 시작하기
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행 중이에요!`);
  console.log(`웹 브라우저에서 http://localhost:${PORT} 주소로 접속해보세요!`);
});
