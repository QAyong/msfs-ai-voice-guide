/**
 * 豆包 TTS 音色批量试听脚本
 *
 * 使用方式：先确保 .env 中已配置火山引擎 TTS 凭据，然后：
 *   node --env-file=.env --import tsx scripts/tts-voice-samples.ts
 *
 * 生成的所有音频文件默认保存在项目 resources/tts/confirmed-voices 文件夹中。
 * 可通过 TTS_SAMPLES_OUTPUT_DIR 覆盖输出目录。
 */

import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import WebSocket from 'ws';

// ---------------------------------------------------------------------------
// 火山 TTS 二进制协议常量（与 src/providers/volcengine/protocol.ts 保持一致）
// ---------------------------------------------------------------------------
const VolcengineMessageType = {
  FullClientRequest: 0b0001,
  AudioOnlyClient: 0b0010,
  FullServerResponse: 0b1001,
  AudioOnlyServer: 0b1011,
  ServerError: 0b1111,
} as const;

const VolcengineMessageFlag = {
  NoSequence: 0b0000,
  PositiveSequence: 0b0001,
  NegativeSequence: 0b0011,
  WithEvent: 0b0100,
} as const;

const VolcengineEvent = {
  ConnectionFailed: 51,
  ConnectionFinished: 52,
  StartConnection: 1,
  ConnectionStarted: 50,
  StartSession: 100,
  SessionStarted: 150,
  FinishSession: 102,
  SessionFinished: 152,
  SessionFailed: 153,
  TaskRequest: 200,
} as const;

// ---------------------------------------------------------------------------
// 协议工具函数
// ---------------------------------------------------------------------------
function writeInt32BE(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(value);
  return buf;
}

function writeUInt32BE(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value);
  return buf;
}

function writeSizedString(value: string): Buffer {
  const buf = Buffer.from(value, 'utf8');
  return Buffer.concat([writeUInt32BE(buf.length), buf]);
}

function createEventMessage(event: number, sessionId?: string, payload: unknown = {}): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const header = Buffer.from([
    0x11,
    (VolcengineMessageType.FullClientRequest << 4) | VolcengineMessageFlag.WithEvent,
    0x10,
    0x00,
  ]);
  const parts = [header, writeInt32BE(event)];
  if (sessionId !== undefined) {
    parts.push(writeSizedString(sessionId));
  }
  parts.push(writeUInt32BE(body.length), body);
  return Buffer.concat(parts);
}

type ParsedVolcengineMessage = {
  type: number;
  flag: number;
  event?: number;
  errorCode?: number;
  payload: Buffer;
};

function parseMessage(data: Buffer): ParsedVolcengineMessage {
  if (data.length < 4) throw new Error('火山 TTS 消息长度不足');
  const headerSize = (data[0]! & 0x0f) * 4;
  if (headerSize < 4 || data.length < headerSize) throw new Error('火山 TTS 消息头无效');
  const type = data[1]! >> 4;
  const flag = data[1]! & 0x0f;
  const compression = data[2]! & 0x0f;
  let offset = headerSize;
  let errorCode: number | undefined;
  let event: number | undefined;

  const sequenceTypes = [
    VolcengineMessageType.FullClientRequest,
    VolcengineMessageType.FullServerResponse,
    VolcengineMessageType.AudioOnlyClient,
    VolcengineMessageType.AudioOnlyServer,
  ];
  if ((sequenceTypes as number[]).includes(type) && (flag & 0x03) !== 0) {
    offset += 4; // 跳过 sequence
  } else if (type === VolcengineMessageType.ServerError) {
    errorCode = data.readUInt32BE(offset);
    offset += 4;
  }

  if (flag === VolcengineMessageFlag.WithEvent) {
    event = data.readInt32BE(offset);
    offset += 4;
    // 跳过可能存在的 sessionId / connectId
    const isSessionEvent =
      event !== VolcengineEvent.StartConnection &&
      event !== VolcengineEvent.ConnectionStarted &&
      event !== VolcengineEvent.ConnectionFailed &&
      event !== VolcengineEvent.ConnectionFinished;
    if (isSessionEvent) {
      const sessLen = data.readUInt32BE(offset);
      offset += 4 + sessLen;
    }
    const isConnectEvent =
      event === VolcengineEvent.ConnectionStarted ||
      event === VolcengineEvent.ConnectionFailed ||
      event === VolcengineEvent.ConnectionFinished;
    if (isConnectEvent) {
      const connLen = data.readUInt32BE(offset);
      offset += 4 + connLen;
    }
  }

  if (offset + 4 > data.length) throw new Error('火山 TTS 消息缺少 payload 长度');
  const payloadLength = data.readUInt32BE(offset);
  offset += 4;
  if (offset + payloadLength > data.length) throw new Error('火山 TTS 消息 payload 不完整');
  const rawPayload = data.subarray(offset, offset + payloadLength);
  const payload = compression === 1 ? gunzipSync(rawPayload) : rawPayload;

  return {
    type,
    flag,
    ...(event === undefined ? {} : { event }),
    ...(errorCode === undefined ? {} : { errorCode }),
    payload,
  };
}

// ---------------------------------------------------------------------------
// WebSocket 辅助
// ---------------------------------------------------------------------------
function connectWebSocket(endpoint: string, headers: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint, { headers });
    socket.once('open', () => resolve(socket));
    socket.once('error', (error) => reject(error));
  });
}

function readMessage(socket: WebSocket, abort?: AbortSignal): Promise<ParsedVolcengineMessage> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.removeListener('message', onMessage);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
      abort?.removeEventListener('abort', onAbort);
    };
    const onMessage = (data: WebSocket.RawData) => {
      cleanup();
      const buffer = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data as ArrayBuffer);
      try {
        resolve(parseMessage(buffer));
      } catch (error) {
        reject(error);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error('WebSocket 在收到完整响应前关闭'));
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('任务已取消'));
    };
    socket.once('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
    abort?.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitForEvent(
  socket: WebSocket,
  expectedEvent: number,
  abort?: AbortSignal,
): Promise<void> {
  while (true) {
    const message = await readMessage(socket, abort);
    if (message.type === VolcengineMessageType.ServerError) {
      throw new Error(`火山 TTS 错误：${message.errorCode ?? 'unknown'}`);
    }
    if (
      message.type === VolcengineMessageType.FullServerResponse &&
      message.event === expectedEvent
    ) {
      return;
    }
    if (
      message.type === VolcengineMessageType.FullServerResponse &&
      message.event === VolcengineEvent.SessionFailed
    ) {
      throw new Error(`火山 TTS 会话失败：${message.payload.toString('utf8') || 'unknown'}`);
    }
  }
}

async function readUntilSessionFinished(
  socket: WebSocket,
  chunks: Buffer[],
  abort?: AbortSignal,
): Promise<void> {
  while (true) {
    const message = await readMessage(socket, abort);
    if (message.type === VolcengineMessageType.ServerError) {
      throw new Error(`火山 TTS 错误：${message.errorCode ?? 'unknown'}`);
    }
    if (message.type === VolcengineMessageType.AudioOnlyServer && message.payload.length > 0) {
      chunks.push(message.payload);
    }
    if (
      message.type === VolcengineMessageType.FullServerResponse &&
      message.event === VolcengineEvent.SessionFinished
    ) {
      return;
    }
    if (
      message.type === VolcengineMessageType.FullServerResponse &&
      message.event === VolcengineEvent.SessionFailed
    ) {
      throw new Error(`火山 TTS 会话失败：${message.payload.toString('utf8') || 'unknown'}`);
    }
  }
}

// ---------------------------------------------------------------------------
// WAV 写入
// ---------------------------------------------------------------------------
function createWav(sampleRate: number, pcm: Buffer): Buffer {
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------
type TtsConfig = {
  appId: string;
  accessToken: string;
  endpoint: string;
  resourceId: string;
  sampleRate: number;
};

function loadTtsConfig(): TtsConfig {
  const appId = process.env.VOLCENGINE_SPEECH_APP_ID?.trim();
  const accessToken = process.env.VOLCENGINE_SPEECH_ACCESS_TOKEN?.trim();
  const endpoint = process.env.VOLCENGINE_TTS_ENDPOINT?.trim();
  const resourceId = process.env.VOLCENGINE_TTS_RESOURCE_ID?.trim();
  const sampleRate = Number(process.env.VOLCENGINE_TTS_SAMPLE_RATE ?? 24000);

  if (!appId || !accessToken || !endpoint || !resourceId) {
    throw new Error(
      '缺少火山 TTS 配置，请检查 .env 中 VOLCENGINE_SPEECH_APP_ID / VOLCENGINE_SPEECH_ACCESS_TOKEN / VOLCENGINE_TTS_ENDPOINT / VOLCENGINE_TTS_RESOURCE_ID',
    );
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new Error('VOLCENGINE_TTS_SAMPLE_RATE 必须为正整数');
  }

  return { appId, accessToken, endpoint, resourceId, sampleRate };
}

// ---------------------------------------------------------------------------
// 音色列表（seed-tts-2.0 官方音色；可在脚本中增删）
// ---------------------------------------------------------------------------
const VOICES: ReadonlyArray<{ name: string; speaker: string }> = [
  { name: 'Vivi-2.0', speaker: 'zh_female_vv_uranus_bigtts' },
  { name: '小何-2.0', speaker: 'zh_female_xiaohe_uranus_bigtts' },
  { name: '云舟-2.0', speaker: 'zh_male_m191_uranus_bigtts' },
  { name: '小天-2.0', speaker: 'zh_male_taocheng_uranus_bigtts' },
  { name: '刘飞-2.0', speaker: 'zh_male_liufei_uranus_bigtts' },
  { name: '魅力苏菲-2.0', speaker: 'zh_female_sophie_uranus_bigtts' },
  { name: '清新女声-2.0', speaker: 'zh_female_qingxinnvsheng_uranus_bigtts' },
  { name: '知性灿灿-2.0', speaker: 'zh_female_cancan_uranus_bigtts' },
  { name: '撒娇学妹-2.0', speaker: 'zh_female_sajiaoxuemei_uranus_bigtts' },
  { name: '甜美小源-2.0', speaker: 'zh_female_tianmeixiaoyuan_uranus_bigtts' },
  { name: '甜美桃子-2.0', speaker: 'zh_female_tianmeitaozi_uranus_bigtts' },
  { name: '爽快思思-2.0', speaker: 'zh_female_shuangkuaisisi_uranus_bigtts' },
  { name: '佩奇猪-2.0', speaker: 'zh_female_peiqi_uranus_bigtts' },
  { name: '邻家女孩-2.0', speaker: 'zh_female_linjianvhai_uranus_bigtts' },
  { name: '少年梓辛-2.0', speaker: 'zh_male_shaonianzixin_uranus_bigtts' },
  { name: '猴哥-2.0', speaker: 'zh_male_sunwukong_uranus_bigtts' },
  { name: 'Tina老师-2.0', speaker: 'zh_female_yingyujiaoxue_uranus_bigtts' },
  { name: '暖阳女声-2.0', speaker: 'zh_female_kefunvsheng_uranus_bigtts' },
  { name: '儿童绘本-2.0', speaker: 'zh_female_xiaoxue_uranus_bigtts' },
  { name: '大壹-2.0', speaker: 'zh_male_dayi_uranus_bigtts' },
  { name: '黑猫侦探社咪仔-2.0', speaker: 'zh_female_mizai_uranus_bigtts' },
  { name: '鸡汤女-2.0', speaker: 'zh_female_jitangnv_uranus_bigtts' },
  { name: '魅力女友-2.0', speaker: 'zh_female_meilinvyou_uranus_bigtts' },
  { name: '流畅女声-2.0', speaker: 'zh_female_liuchangnv_uranus_bigtts' },
  { name: '儒雅逸辰-2.0', speaker: 'zh_male_ruyayichen_uranus_bigtts' },
  { name: '温柔妈妈-2.0', speaker: 'zh_female_wenroumama_uranus_bigtts' },
  { name: '解说小明-2.0', speaker: 'zh_male_jieshuoxiaoming_uranus_bigtts' },
  { name: 'TVB女声-2.0', speaker: 'zh_female_tvbnv_uranus_bigtts' },
  { name: '译制片男-2.0', speaker: 'zh_male_yizhipiannan_uranus_bigtts' },
  { name: '俏皮女声-2.0', speaker: 'zh_female_qiaopinv_uranus_bigtts' },
  { name: '直率英子-2.0', speaker: 'zh_female_zhishuaiyingzi_uranus_bigtts' },
  { name: '邻家男孩-2.0', speaker: 'zh_male_linjiananhai_uranus_bigtts' },
  { name: '四郎-2.0', speaker: 'zh_male_silang_uranus_bigtts' },
  { name: '儒雅青年-2.0', speaker: 'zh_male_ruyaqingnian_uranus_bigtts' },
  { name: '擎苍-2.0', speaker: 'zh_male_qingcang_uranus_bigtts' },
  { name: '熊二-2.0', speaker: 'zh_male_xionger_uranus_bigtts' },
  { name: '樱桃丸子-2.0', speaker: 'zh_female_yingtaowanzi_uranus_bigtts' },
  { name: '温暖阿虎-2.0', speaker: 'zh_male_wennuanahu_uranus_bigtts' },
  { name: '奶气萌娃-2.0', speaker: 'zh_male_naiqimengwa_uranus_bigtts' },
  { name: '婆婆-2.0', speaker: 'zh_female_popo_uranus_bigtts' },
  { name: '高冷御姐-2.0', speaker: 'zh_female_gaolengyujie_uranus_bigtts' },
  { name: '傲娇霸总-2.0', speaker: 'zh_male_aojiaobazong_uranus_bigtts' },
  { name: '懒音绵宝-2.0', speaker: 'zh_male_lanyinmianbao_uranus_bigtts' },
  { name: '反卷青年-2.0', speaker: 'zh_male_fanjuanqingnian_uranus_bigtts' },
  { name: '温柔淑女-2.0', speaker: 'zh_female_wenroushunv_uranus_bigtts' },
  { name: '古风少御-2.0', speaker: 'zh_female_gufengshaoyu_uranus_bigtts' },
  { name: '活力小哥-2.0', speaker: 'zh_male_huolixiaoge_uranus_bigtts' },
  { name: '霸气青叔-2.0', speaker: 'zh_male_baqiqingshu_uranus_bigtts' },
  { name: '悬疑解说-2.0', speaker: 'zh_male_xuanyijieshuo_uranus_bigtts' },
  { name: '萌丫头-2.0', speaker: 'zh_female_mengyatou_uranus_bigtts' },
  { name: '贴心女声-2.0', speaker: 'zh_female_tiexinnvsheng_uranus_bigtts' },
  { name: '鸡汤妹妹-2.0', speaker: 'zh_female_jitangmei_uranus_bigtts' },
  { name: '磁性解说男声-2.0', speaker: 'zh_male_cixingjieshuonan_uranus_bigtts' },
  { name: '亮嗓萌仔-2.0', speaker: 'zh_male_liangsangmengzai_uranus_bigtts' },
  { name: '开朗姐姐-2.0', speaker: 'zh_female_kailangjiejie_uranus_bigtts' },
  { name: '高冷沉稳-2.0', speaker: 'zh_male_gaolengchenwen_uranus_bigtts' },
  { name: '深夜播客-2.0', speaker: 'zh_male_shenyeboke_uranus_bigtts' },
  { name: '鲁班七号-2.0', speaker: 'zh_male_lubanqihao_uranus_bigtts' },
  { name: '娇喘女声-2.0', speaker: 'zh_female_jiaochuannv_uranus_bigtts' },
  { name: '林潇-2.0', speaker: 'zh_female_linxiao_uranus_bigtts' },
  { name: '玲玲姐姐-2.0', speaker: 'zh_female_lingling_uranus_bigtts' },
  { name: '春日部姐姐-2.0', speaker: 'zh_female_chunribu_uranus_bigtts' },
  { name: '唐僧-2.0', speaker: 'zh_male_tangseng_uranus_bigtts' },
  { name: '庄周-2.0', speaker: 'zh_male_zhuangzhou_uranus_bigtts' },
  { name: '开朗弟弟-2.0', speaker: 'zh_male_kailangdidi_uranus_bigtts' },
  { name: '猪八戒-2.0', speaker: 'zh_male_zhubajie_uranus_bigtts' },
  { name: '感冒电音姐姐-2.0', speaker: 'zh_female_ganmaodianyin_uranus_bigtts' },
  { name: '谄媚女声-2.0', speaker: 'zh_female_chanmeinv_uranus_bigtts' },
  { name: '女雷神-2.0', speaker: 'zh_female_nvleishen_uranus_bigtts' },
  { name: '亲切女声-2.0', speaker: 'zh_female_qinqienv_uranus_bigtts' },
  { name: '快乐小东-2.0', speaker: 'zh_male_kuailexiaodong_uranus_bigtts' },
  { name: '开朗学长-2.0', speaker: 'zh_male_kailangxuezhang_uranus_bigtts' },
  { name: '悠悠君子-2.0', speaker: 'zh_male_youyoujunzi_uranus_bigtts' },
  { name: '文静毛毛-2.0', speaker: 'zh_female_wenjingmaomao_uranus_bigtts' },
  { name: '知性女声-2.0', speaker: 'zh_female_zhixingnv_uranus_bigtts' },
  { name: '清爽男大-2.0', speaker: 'zh_male_qingshuangnanda_uranus_bigtts' },
  { name: '渊博小叔-2.0', speaker: 'zh_male_yuanboxiaoshu_uranus_bigtts' },
  { name: '阳光青年-2.0', speaker: 'zh_male_yangguangqingnian_uranus_bigtts' },
  { name: '清澈梓梓-2.0', speaker: 'zh_female_qingchezizi_uranus_bigtts' },
  { name: '甜美悦悦-2.0', speaker: 'zh_female_tianmeiyueyue_uranus_bigtts' },
  { name: '心灵鸡汤-2.0', speaker: 'zh_female_xinlingjitang_uranus_bigtts' },
  { name: '温柔小哥-2.0', speaker: 'zh_male_wenrouxiaoge_uranus_bigtts' },
  { name: '柔美女友-2.0', speaker: 'zh_female_roumeinvyou_uranus_bigtts' },
  { name: '东方浩然-2.0', speaker: 'zh_male_dongfanghaoran_uranus_bigtts' },
  { name: '温柔小雅-2.0', speaker: 'zh_female_wenrouxiaoya_uranus_bigtts' },
  { name: '天才童声-2.0', speaker: 'zh_male_tiancaitongsheng_uranus_bigtts' },
  { name: '武则天-2.0', speaker: 'zh_female_wuzetian_uranus_bigtts' },
  { name: '顾姐-2.0', speaker: 'zh_female_gujie_uranus_bigtts' },
  { name: 'Dacey', speaker: 'en_female_dacey_uranus_bigtts' },
  { name: 'Stokie', speaker: 'en_female_stokie_uranus_bigtts' },
];

const SAMPLE_TEXT =
  '你好，我是晓晓飞行导游的语音助手。下面这句话可以用来确认音色和自然度：今天天气不错，我们准备从跑道起飞，祝你飞行愉快。';
const SAMPLE_TEXT_EN =
  'Hello, I am the voice assistant for Xiaoxiao Flight Guide. The weather is clear today, and we are ready for takeoff. Have a pleasant flight.';

// ---------------------------------------------------------------------------
// 单音色合成
// ---------------------------------------------------------------------------
async function synthesizeOne(
  config: TtsConfig,
  voice: { name: string; speaker: string },
  abort?: AbortSignal,
): Promise<Buffer> {
  const connectId = randomUUID();
  const sessionId = randomUUID();
  const chunks: Buffer[] = [];
  let socket: WebSocket | undefined;

  try {
    socket = await connectWebSocket(config.endpoint, {
      'X-Api-App-Key': config.appId,
      'X-Api-Access-Key': config.accessToken,
      'X-Api-Resource-Id': config.resourceId,
      'X-Api-Connect-Id': connectId,
    });

    socket.send(createEventMessage(VolcengineEvent.StartConnection));
    await waitForEvent(socket, VolcengineEvent.ConnectionStarted, abort);

    const baseRequest = {
      user: { uid: connectId },
      namespace: 'BidirectionalTTS',
      req_params: {
        speaker: voice.speaker,
        audio_params: {
          format: 'pcm',
          sample_rate: config.sampleRate,
          enable_timestamp: true,
        },
        additions: JSON.stringify({ disable_markdown_filter: false }),
      },
    };
    socket.send(
      createEventMessage(VolcengineEvent.StartSession, sessionId, {
        ...baseRequest,
        event: VolcengineEvent.StartSession,
      }),
    );
    await waitForEvent(socket, VolcengineEvent.SessionStarted, abort);

    socket.send(
      createEventMessage(VolcengineEvent.TaskRequest, sessionId, {
        ...baseRequest,
        event: VolcengineEvent.TaskRequest,
        req_params: {
          ...baseRequest.req_params,
          text: voice.speaker.startsWith('en_') ? SAMPLE_TEXT_EN : SAMPLE_TEXT,
        },
      }),
    );
    socket.send(createEventMessage(VolcengineEvent.FinishSession, sessionId, {}));
    await readUntilSessionFinished(socket, chunks, abort);
    socket.send(createEventMessage(VolcengineEvent.FinishConnection));

    const pcm = Buffer.concat(chunks);
    if (pcm.length === 0) {
      throw new Error('服务端未返回音频数据');
    }
    return pcm;
  } finally {
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close();
    }
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const config = loadTtsConfig();
  const outputDir = process.env.TTS_SAMPLES_OUTPUT_DIR?.trim()
    ? resolve(process.env.TTS_SAMPLES_OUTPUT_DIR)
    : join(resolve(import.meta.dirname, '..'), 'resources', 'tts', 'confirmed-voices');
  await mkdir(outputDir, { recursive: true });

  const requested =
    process.env.VOICE_FILTER?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  const voices =
    requested.length > 0 ? VOICES.filter((voice) => requested.includes(voice.speaker)) : VOICES;
  if (voices.length === 0) {
    throw new Error(`VOICE_FILTER 未匹配到任何音色：${process.env.VOICE_FILTER ?? ''}`);
  }

  const abort = new AbortController();
  process.on('SIGINT', () => abort.abort());
  process.on('SIGTERM', () => abort.abort());

  const started = Date.now();
  let okCount = 0;
  let failCount = 0;
  const failures: Array<{ name: string; speaker: string; error: string }> = [];

  console.log(`音色数量：${voices.length}`);
  console.log(`输出目录：${outputDir}`);
  console.log('');

  for (let index = 0; index < voices.length; index += 1) {
    const voice = voices[index]!;
    const label = `[${String(index + 1).padStart(String(voices.length).length, '0')}/${voices.length}] ${voice.name}`;
    try {
      const pcm = await synthesizeOne(config, voice, abort.signal);
      const safeName = voice.name.replace(/[\\/:*?"<>|]/g, '-');
      const filePath = join(outputDir, `${safeName}_${voice.speaker}.wav`);
      await writeFile(filePath, createWav(config.sampleRate, pcm));
      okCount += 1;
      console.log(`✓ ${label} -> ${voice.speaker}`);
    } catch (error) {
      failCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ name: voice.name, speaker: voice.speaker, error: message });
      console.warn(`✗ ${label} 失败：${message}`);
    }
  }

  console.log('');
  console.log(
    `完成：成功 ${okCount}，失败 ${failCount}，耗时 ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  console.log(`文件夹：${outputDir}`);
  if (failures.length > 0) {
    console.log('');
    console.log('失败列表：');
    for (const failure of failures) {
      console.log(`- ${failure.name} (${failure.speaker}): ${failure.error}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
