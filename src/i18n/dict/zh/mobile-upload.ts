// Chinese copy for the phone-upload page the desktop app serves on the local network
// (server/mobile-upload-service.ts). That page renders standalone HTML outside React, so it
// carries its own per-locale copy table instead of going through t(); the Chinese half lives
// here with the rest of the zh dictionary.
export const ZH_MOBILE_UPLOAD_COPY = {
  pageTitle: 'Upload from phone',
  title: '发送素材到 Aquarius Editor',
  hint: '选择手机里的视频、图片或音频。电脑和手机需连接同一局域网。',
  choose: '选择素材',
  multiple: '支持多选，页面保持打开直到全部完成',
  waiting: '等待上传',
  sent: '已发送',
  failed: '上传失败',
  interrupted: '网络中断',
} as const;
