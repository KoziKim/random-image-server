// 필요한 도구들을 가져와요
require("dotenv").config(); // 환경 변수 로드
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 환경 변수 설정 (배포 환경을 위한 설정)
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ""; // 실제 배포 시 환경 변수로 설정

// 서버 만들기
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 이미지를 저장할 디렉토리 생성 (웹 UI용으로만 사용)
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 정적 파일 서빙을 위한 미들웨어 설정
app.use("/uploads", express.static(uploadsDir));

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

// 이미지 다운로드 엔드포인트 (웹 UI용으로만 사용)
app.get("/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);

  // 파일이 존재하는지 확인
  if (fs.existsSync(filePath)) {
    // 다운로드를 위한 헤더 설정
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-Type", "image/jpeg");

    // 파일 스트림 생성 및 응답으로 전송
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } else {
    res.status(404).send("파일을 찾을 수 없습니다.");
  }
});

// 슬랙 슬래시 명령어 처리 엔드포인트
app.post("/api/slack-command", async (req, res) => {
  try {
    // 슬랙에서 보낸 데이터 확인
    const { text, response_url, channel_id, user_id, user_name, command } =
      req.body;

    console.log(`슬랙 명령어 수신: ${command} by ${user_name} (${user_id})`);
    console.log(`채널 ID: ${channel_id}, 응답 URL: ${response_url}`);
    console.log(`요청 데이터:`, req.body);

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
      // 랜덤 시드 생성 (동일한 이미지를 보장하기 위해)
      const randomSeed = Math.floor(Math.random() * 1000);

      // 이미지 URL 생성
      const imageUrl = `https://picsum.photos/${width}/${height}?random=${randomSeed}`;

      console.log(`이미지 URL 생성: ${imageUrl}`);

      // 이미지 다운로드
      console.log("이미지 다운로드 시작...");
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.buffer();
      console.log(`이미지 다운로드 완료: ${imageBuffer.length} bytes`);

      if (SLACK_BOT_TOKEN) {
        try {
          // 1. 파일 업로드 URL 가져오기
          console.log("슬랙 파일 업로드 URL 요청 중...");
          const filename = `random-${width}x${height}-${Date.now()}.jpg`;

          const uploadUrlResponse = await fetch(
            "https://slack.com/api/files.getUploadURLExternal",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                filename: filename,
                length: imageBuffer.length,
              }),
            }
          );

          const uploadUrlResult = await uploadUrlResponse.json();
          console.log("업로드 URL 응답:", JSON.stringify(uploadUrlResult));

          if (!uploadUrlResult.ok) {
            throw new Error(
              `업로드 URL 가져오기 실패: ${uploadUrlResult.error}`
            );
          }

          const { upload_url, file_id } = uploadUrlResult;

          // 2. 파일 업로드
          console.log(`파일 업로드 중... (${upload_url})`);
          const formData = new FormData();
          formData.append("file", imageBuffer, {
            filename: filename,
            contentType: "image/jpeg",
          });

          const uploadResponse = await fetch(upload_url, {
            method: "POST",
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error(`파일 업로드 실패: ${uploadResponse.statusText}`);
          }

          console.log("파일 업로드 성공");

          // 3. 업로드 완료 및 채널에 공유
          console.log(`업로드 완료 요청 중... (file_id: ${file_id})`);
          const completeResponse = await fetch(
            "https://slack.com/api/files.completeUploadExternal",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                files: [
                  { id: file_id, title: `랜덤 이미지 ${width}x${height}` },
                ],
                channel_id: channel_id,
                initial_comment: `*${width}x${height}* 크기의 랜덤 이미지입니다!`,
              }),
            }
          );

          const completeResult = await completeResponse.json();
          console.log("업로드 완료 응답:", JSON.stringify(completeResult));

          if (!completeResult.ok) {
            throw new Error(`업로드 완료 실패: ${completeResult.error}`);
          }

          console.log("파일 업로드 및 공유 완료");
        } catch (uploadError) {
          console.error("슬랙 파일 업로드 오류:", uploadError);

          // 업로드 실패 시 대체 방법으로 이미지 URL과 다운로드 버튼 제공
          if (response_url) {
            console.log("대체 방법으로 이미지 URL과 다운로드 버튼 제공");

            // 고유한 ID 생성
            const imageId = `${Date.now()}-${crypto
              .randomBytes(4)
              .toString("hex")}`;

            // 다운로드 URL 생성
            const downloadUrl = `${req.protocol}://${req.get(
              "host"
            )}/api/download-image?width=${width}&height=${height}&id=${imageId}&seed=${randomSeed}`;

            await fetch(response_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                response_type: "in_channel",
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `*${width}x${height}* 크기의 랜덤 이미지입니다!\n\n*참고*: 파일 업로드 중 오류가 발생했습니다: ${uploadError.message}`,
                    },
                  },
                  {
                    type: "image",
                    title: {
                      type: "plain_text",
                      text: "랜덤 이미지",
                    },
                    image_url: imageUrl,
                    alt_text: "랜덤 이미지",
                  },
                  {
                    type: "actions",
                    elements: [
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          text: "이미지 다운로드",
                        },
                        url: downloadUrl,
                        action_id: "download_image",
                      },
                    ],
                  },
                ],
              }),
            });
          }
        }
      } else {
        console.log(
          "SLACK_BOT_TOKEN이 설정되지 않았습니다. 이미지 URL만 전송합니다."
        );

        // 토큰이 없는 경우 응답 URL로 이미지 URL만 전송
        if (response_url) {
          // 고유한 ID 생성
          const imageId = `${Date.now()}-${crypto
            .randomBytes(4)
            .toString("hex")}`;

          // 다운로드 URL 생성
          const downloadUrl = `${req.protocol}://${req.get(
            "host"
          )}/api/download-image?width=${width}&height=${height}&id=${imageId}&seed=${randomSeed}`;

          await fetch(response_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              response_type: "in_channel",
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `*${width}x${height}* 크기의 랜덤 이미지입니다!`,
                  },
                },
                {
                  type: "image",
                  title: {
                    type: "plain_text",
                    text: "랜덤 이미지",
                  },
                  image_url: imageUrl,
                  alt_text: "랜덤 이미지",
                },
                {
                  type: "actions",
                  elements: [
                    {
                      type: "button",
                      text: {
                        type: "plain_text",
                        text: "이미지 다운로드",
                      },
                      url: downloadUrl,
                      action_id: "download_image",
                    },
                  ],
                },
              ],
            }),
          });
        }
      }
    } catch (error) {
      console.error("이미지 처리 오류:", error);
      // 오류 발생 시 메시지 업데이트
      if (response_url) {
        await fetch(response_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response_type: "in_channel",
            text: `이미지를 생성하는 중에 문제가 발생했습니다: ${error.message}`,
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
        text: `이미지를 생성하는 중에 문제가 발생했습니다: ${error.message}`,
      });
    }
  }
});

// 이미지 다운로드 API 엔드포인트 (슬랙 버튼용)
app.get("/api/download-image", async (req, res) => {
  try {
    const width = req.query.width || 500;
    const height = req.query.height || 500;
    const id = req.query.id || Date.now();
    const seed = req.query.seed || Math.floor(Math.random() * 1000);

    // 동일한 랜덤 시드를 사용하여 동일한 이미지 URL 생성
    const imageUrl = `https://picsum.photos/${width}/${height}?random=${seed}`;

    console.log(`다운로드 요청 처리: ${imageUrl}`);

    // 이미지 가져오기
    const imageResponse = await fetch(imageUrl);
    const imageBuffer = await imageResponse.buffer();

    // 이미지 다운로드 응답 설정
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="random-${width}x${height}-${id}.jpg"`
    );
    res.send(imageBuffer);

    console.log(`이미지 다운로드 완료: ${imageBuffer.length} bytes`);
  } catch (error) {
    console.error("다운로드 처리 오류:", error);
    res.status(500).send("이미지를 가져오는 중에 문제가 발생했습니다.");
  }
});

// 서버 시작하기
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`서버가 ${PORT} 포트에서 실행 중이에요!`);
  console.log(`웹 브라우저에서 http://localhost:${PORT} 주소로 접속해보세요!`);
  console.log(`업로드 디렉토리: ${uploadsDir} (웹 UI용)`);
  console.log(
    `SLACK_BOT_TOKEN ${SLACK_BOT_TOKEN ? "설정됨" : "설정되지 않음"}`
  );
});
