#!/usr/bin/env node
/** Apply localized speech/TTS key translations to all non-de/en locale files. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "../src/lib/i18n/messages");

const PATCH_KEYS = [
  "settings.speech.hybridTtsBackend.label",
  "settings.speech.hybridTtsBackend.piper",
  "settings.speech.hybridTtsBackend.edgeTts",
  "settings.speech.localAsrModel.whisper_small_de",
  "settings.speech.localAsrModel.sense_voice_int8",
  "settings.speech.localAsrModel.whisperRecommendedHint",
  "settings.speech.localAsrModel.senseVoiceRecommendedHint",
  "settings.speech.asrStatus.ready.sense_voice_int8",
  "settings.speech.ttsTest.label",
  "settings.speech.ttsTest.placeholder",
  "settings.speech.ttsTest.button",
  "settings.speech.ttsTest.testing",
  "settings.speech.ttsTest.success",
  "settings.speech.ttsTest.failed",
  "settings.speech.ttsTest.edgeHint",
  "settings.speech.ttsTest.piperHint",
  "settings.speech.ttsTest.piperMissing",
  "settings.speech.ttsTest.unknownError",
];

/** @type {Record<string, Record<string, string>>} */
const TRANSLATIONS = {
  fr: {
    "settings.speech.hybridTtsBackend.label": "TTS (hybride)",
    "settings.speech.hybridTtsBackend.piper": "Piper (hors ligne, recommandé)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, en ligne)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (recommandé pour les langues européennes)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (recommandé pour le japonais et le chinois)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper est recommandé pour la langue de l'application sélectionnée.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice est recommandé lorsque la langue de l'application est le japonais ou le chinois.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "Modèle SenseVoice trouvé et prêt.",
    "settings.speech.ttsTest.label": "Tester la synthèse vocale",
    "settings.speech.ttsTest.placeholder": "Texte d'exemple pour le test de lecture à voix haute…",
    "settings.speech.ttsTest.button": "Lancer le test",
    "settings.speech.ttsTest.testing": "Synthèse et lecture…",
    "settings.speech.ttsTest.success": "Lecture démarrée ({backend}, voix : {voice}).",
    "settings.speech.ttsTest.failed": "Échec du test : {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS nécessite Internet. Le repli Piper est désactivé lorsque Edge TTS est sélectionné.",
    "settings.speech.ttsTest.piperHint":
      "Installer les voix Piper : npm run download:speech-tts (une voix installée est choisie automatiquement)",
    "settings.speech.ttsTest.piperMissing":
      "Aucune voix Piper installée. Exécutez npm run download:speech-tts ou basculez le TTS vers Microsoft Edge (en ligne).",
    "settings.speech.ttsTest.unknownError": "Erreur inconnue",
  },
  es: {
    "settings.speech.hybridTtsBackend.label": "TTS (híbrido)",
    "settings.speech.hybridTtsBackend.piper": "Piper (sin conexión, recomendado)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, en línea)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (recomendado para idiomas europeos)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (recomendado para japonés y chino)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper se recomienda para el idioma de la aplicación seleccionado.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice se recomienda cuando el idioma de la aplicación es japonés o chino.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "Modelo SenseVoice encontrado y listo.",
    "settings.speech.ttsTest.label": "Probar síntesis de voz",
    "settings.speech.ttsTest.placeholder":
      "Texto de ejemplo para la prueba de lectura en voz alta…",
    "settings.speech.ttsTest.button": "Reproducir prueba",
    "settings.speech.ttsTest.testing": "Sintetizando y reproduciendo…",
    "settings.speech.ttsTest.success": "Reproducción iniciada ({backend}, voz: {voice}).",
    "settings.speech.ttsTest.failed": "Prueba fallida: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS requiere Internet. El respaldo de Piper está desactivado cuando Edge TTS está seleccionado.",
    "settings.speech.ttsTest.piperHint":
      "Instalar voces Piper: npm run download:speech-tts (se elige automáticamente una voz instalada)",
    "settings.speech.ttsTest.piperMissing":
      "No hay voz Piper instalada. Ejecute npm run download:speech-tts o cambie el TTS a Microsoft Edge (en línea).",
    "settings.speech.ttsTest.unknownError": "Error desconocido",
  },
  zh: {
    "settings.speech.hybridTtsBackend.label": "TTS（混合）",
    "settings.speech.hybridTtsBackend.piper": "Piper（离线，推荐）",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge（edge-tts，在线）",
    "settings.speech.localAsrModel.whisper_small_de": "Whisper Small（推荐用于欧洲语言）",
    "settings.speech.localAsrModel.sense_voice_int8": "SenseVoice（推荐用于日语和中文）",
    "settings.speech.localAsrModel.whisperRecommendedHint": "对于所选应用语言，推荐使用 Whisper。",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "当应用语言为日语或中文时，推荐使用 SenseVoice。",
    "settings.speech.asrStatus.ready.sense_voice_int8": "已找到 SenseVoice 模型并可供使用。",
    "settings.speech.ttsTest.label": "测试语音输出",
    "settings.speech.ttsTest.placeholder": "朗读测试的示例文本…",
    "settings.speech.ttsTest.button": "播放测试",
    "settings.speech.ttsTest.testing": "正在合成并播放…",
    "settings.speech.ttsTest.success": "已开始播放（{backend}，语音：{voice}）。",
    "settings.speech.ttsTest.failed": "测试失败：{message}",
    "settings.speech.ttsTest.edgeHint": "Edge TTS 需要互联网。选择 Edge TTS 时，Piper 备用已禁用。",
    "settings.speech.ttsTest.piperHint":
      "安装 Piper 语音：npm run download:speech-tts（将自动选择已安装的语音）",
    "settings.speech.ttsTest.piperMissing":
      "未安装 Piper 语音。请运行 npm run download:speech-tts 或将 TTS 切换为 Microsoft Edge（在线）。",
    "settings.speech.ttsTest.unknownError": "未知错误",
  },
  ja: {
    "settings.speech.hybridTtsBackend.label": "TTS（ハイブリッド）",
    "settings.speech.hybridTtsBackend.piper": "Piper（オフライン、推奨）",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge（edge-tts、オンライン）",
    "settings.speech.localAsrModel.whisper_small_de": "Whisper Small（欧州言語向け推奨）",
    "settings.speech.localAsrModel.sense_voice_int8": "SenseVoice（日本語・中国語向け推奨）",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "選択したアプリ言語には Whisper が推奨されます。",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "アプリ言語が日本語または中国語の場合、SenseVoice が推奨されます。",
    "settings.speech.asrStatus.ready.sense_voice_int8":
      "SenseVoice モデルが見つかり、使用可能です。",
    "settings.speech.ttsTest.label": "音声出力をテスト",
    "settings.speech.ttsTest.placeholder": "読み上げテスト用のサンプルテキスト…",
    "settings.speech.ttsTest.button": "テスト再生",
    "settings.speech.ttsTest.testing": "合成と再生中…",
    "settings.speech.ttsTest.success": "再生を開始しました（{backend}、音声：{voice}）。",
    "settings.speech.ttsTest.failed": "テスト失敗：{message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS にはインターネットが必要です。Edge TTS 選択時は Piper フォールバックは無効です。",
    "settings.speech.ttsTest.piperHint":
      "Piper 音声をインストール：npm run download:speech-tts（インストール済み音声が自動選択されます）",
    "settings.speech.ttsTest.piperMissing":
      "Piper 音声がインストールされていません。npm run download:speech-tts を実行するか、TTS を Microsoft Edge（オンライン）に切り替えてください。",
    "settings.speech.ttsTest.unknownError": "不明なエラー",
  },
  nl: {
    "settings.speech.hybridTtsBackend.label": "TTS (hybride)",
    "settings.speech.hybridTtsBackend.piper": "Piper (offline, aanbevolen)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (aanbevolen voor Europese talen)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (aanbevolen voor Japans en Chinees)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper wordt aanbevolen voor de geselecteerde app-taal.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice wordt aanbevolen wanneer de app-taal Japans of Chinees is.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "SenseVoice-model gevonden en gereed.",
    "settings.speech.ttsTest.label": "Spraakuitvoer testen",
    "settings.speech.ttsTest.placeholder": "Voorbeeldtekst voor de voorleestest…",
    "settings.speech.ttsTest.button": "Test afspelen",
    "settings.speech.ttsTest.testing": "Synthetiseren en afspelen…",
    "settings.speech.ttsTest.success": "Afspelen gestart ({backend}, stem: {voice}).",
    "settings.speech.ttsTest.failed": "Test mislukt: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS vereist internet. Piper-fallback is uitgeschakeld wanneer Edge TTS is geselecteerd.",
    "settings.speech.ttsTest.piperHint":
      "Piper-stemmen installeren: npm run download:speech-tts (een geïnstalleerde stem wordt automatisch gekozen)",
    "settings.speech.ttsTest.piperMissing":
      "Geen Piper-stem geïnstalleerd. Voer npm run download:speech-tts uit of schakel TTS over naar Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Onbekende fout",
  },
  pt: {
    "settings.speech.hybridTtsBackend.label": "TTS (híbrido)",
    "settings.speech.hybridTtsBackend.piper": "Piper (offline, recomendado)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (recomendado para idiomas europeus)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (recomendado para japonês e chinês)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper é recomendado para o idioma do aplicativo selecionado.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice é recomendado quando o idioma do aplicativo é japonês ou chinês.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "Modelo SenseVoice encontrado e pronto.",
    "settings.speech.ttsTest.label": "Testar saída de voz",
    "settings.speech.ttsTest.placeholder": "Texto de exemplo para o teste de leitura em voz alta…",
    "settings.speech.ttsTest.button": "Reproduzir teste",
    "settings.speech.ttsTest.testing": "Sintetizando e reproduzindo…",
    "settings.speech.ttsTest.success": "Reprodução iniciada ({backend}, voz: {voice}).",
    "settings.speech.ttsTest.failed": "Teste falhou: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS requer internet. O fallback Piper está desativado quando Edge TTS está selecionado.",
    "settings.speech.ttsTest.piperHint":
      "Instalar vozes Piper: npm run download:speech-tts (uma voz instalada é escolhida automaticamente)",
    "settings.speech.ttsTest.piperMissing":
      "Nenhuma voz Piper instalada. Execute npm run download:speech-tts ou mude o TTS para Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Erro desconhecido",
  },
  pl: {
    "settings.speech.hybridTtsBackend.label": "TTS (hybrydowy)",
    "settings.speech.hybridTtsBackend.piper": "Piper (offline, zalecany)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (zalecany dla języków europejskich)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (zalecany dla japońskiego i chińskiego)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper jest zalecany dla wybranego języka aplikacji.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice jest zalecany, gdy językiem aplikacji jest japoński lub chiński.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "Model SenseVoice znaleziony i gotowy.",
    "settings.speech.ttsTest.label": "Testuj syntezę mowy",
    "settings.speech.ttsTest.placeholder": "Przykładowy tekst do testu odczytu…",
    "settings.speech.ttsTest.button": "Odtwórz test",
    "settings.speech.ttsTest.testing": "Synteza i odtwarzanie…",
    "settings.speech.ttsTest.success": "Odtwarzanie rozpoczęte ({backend}, głos: {voice}).",
    "settings.speech.ttsTest.failed": "Test nieudany: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS wymaga internetu. Fallback Piper jest wyłączony, gdy wybrano Edge TTS.",
    "settings.speech.ttsTest.piperHint":
      "Zainstaluj głosy Piper: npm run download:speech-tts (zainstalowany głos jest wybierany automatycznie)",
    "settings.speech.ttsTest.piperMissing":
      "Brak zainstalowanego głosu Piper. Uruchom npm run download:speech-tts lub przełącz TTS na Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Nieznany błąd",
  },
  cs: {
    "settings.speech.hybridTtsBackend.label": "TTS (hybridní)",
    "settings.speech.hybridTtsBackend.piper": "Piper (offline, doporučeno)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (doporučeno pro evropské jazyky)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (doporučeno pro japonštinu a čínštinu)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Pro vybraný jazyk aplikace se doporučuje Whisper.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice se doporučuje, pokud je jazyk aplikace japonština nebo čínština.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "Model SenseVoice nalezen a připraven.",
    "settings.speech.ttsTest.label": "Otestovat hlasový výstup",
    "settings.speech.ttsTest.placeholder": "Ukázkový text pro test čtení nahlas…",
    "settings.speech.ttsTest.button": "Přehrát test",
    "settings.speech.ttsTest.testing": "Syntéza a přehrávání…",
    "settings.speech.ttsTest.success": "Přehrávání spuštěno ({backend}, hlas: {voice}).",
    "settings.speech.ttsTest.failed": "Test selhal: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS vyžaduje internet. Záloha Piper je zakázána, pokud je vybrán Edge TTS.",
    "settings.speech.ttsTest.piperHint":
      "Nainstalujte hlasy Piper: npm run download:speech-tts (nainstalovaný hlas se vybere automaticky)",
    "settings.speech.ttsTest.piperMissing":
      "Není nainstalován žádný hlas Piper. Spusťte npm run download:speech-tts nebo přepněte TTS na Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Neznámá chyba",
  },
  it: {
    "settings.speech.hybridTtsBackend.label": "TTS (ibrido)",
    "settings.speech.hybridTtsBackend.piper": "Piper (offline, consigliato)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (consigliato per le lingue europee)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (consigliato per giapponese e cinese)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper è consigliato per la lingua dell'app selezionata.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice è consigliato quando la lingua dell'app è giapponese o cinese.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "Modello SenseVoice trovato e pronto.",
    "settings.speech.ttsTest.label": "Testa sintesi vocale",
    "settings.speech.ttsTest.placeholder": "Testo di esempio per il test di lettura ad alta voce…",
    "settings.speech.ttsTest.button": "Riproduci test",
    "settings.speech.ttsTest.testing": "Sintesi e riproduzione…",
    "settings.speech.ttsTest.success": "Riproduzione avviata ({backend}, voce: {voice}).",
    "settings.speech.ttsTest.failed": "Test fallito: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS richiede internet. Il fallback Piper è disabilitato quando Edge TTS è selezionato.",
    "settings.speech.ttsTest.piperHint":
      "Installa voci Piper: npm run download:speech-tts (viene scelta automaticamente una voce installata)",
    "settings.speech.ttsTest.piperMissing":
      "Nessuna voce Piper installata. Esegui npm run download:speech-tts o passa il TTS a Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Errore sconosciuto",
  },
  sv: {
    "settings.speech.hybridTtsBackend.label": "TTS (hybrid)",
    "settings.speech.hybridTtsBackend.piper": "Piper (offline, rekommenderas)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (rekommenderas för europeiska språk)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (rekommenderas för japanska och kinesiska)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper rekommenderas för det valda appspråket.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice rekommenderas när appspråket är japanska eller kinesiska.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "SenseVoice-modell hittad och redo.",
    "settings.speech.ttsTest.label": "Testa röstutmatning",
    "settings.speech.ttsTest.placeholder": "Exempeltext för uppläsningstest…",
    "settings.speech.ttsTest.button": "Spela upp test",
    "settings.speech.ttsTest.testing": "Syntetiserar och spelar upp…",
    "settings.speech.ttsTest.success": "Uppspelning startad ({backend}, röst: {voice}).",
    "settings.speech.ttsTest.failed": "Test misslyckades: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS kräver internet. Piper-reserv är inaktiverad när Edge TTS är valt.",
    "settings.speech.ttsTest.piperHint":
      "Installera Piper-röster: npm run download:speech-tts (en installerad röst väljs automatiskt)",
    "settings.speech.ttsTest.piperMissing":
      "Ingen Piper-röst installerad. Kör npm run download:speech-tts eller byt TTS till Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Okänt fel",
  },
  no: {
    "settings.speech.hybridTtsBackend.label": "TTS (hybrid)",
    "settings.speech.hybridTtsBackend.piper": "Piper (offline, anbefalt)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (anbefalt for europeiske språk)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (anbefalt for japansk og kinesisk)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper anbefales for det valgte appspråket.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice anbefales når appspråket er japansk eller kinesisk.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "SenseVoice-modell funnet og klar.",
    "settings.speech.ttsTest.label": "Test taleutdata",
    "settings.speech.ttsTest.placeholder": "Eksempeltekst for opplesningstest…",
    "settings.speech.ttsTest.button": "Spill av test",
    "settings.speech.ttsTest.testing": "Syntetiserer og spiller av…",
    "settings.speech.ttsTest.success": "Avspilling startet ({backend}, stemme: {voice}).",
    "settings.speech.ttsTest.failed": "Test mislyktes: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS krever internett. Piper-reserve er deaktivert når Edge TTS er valgt.",
    "settings.speech.ttsTest.piperHint":
      "Installer Piper-stemmer: npm run download:speech-tts (en installert stemme velges automatisk)",
    "settings.speech.ttsTest.piperMissing":
      "Ingen Piper-stemme installert. Kjør npm run download:speech-tts eller bytt TTS til Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Ukjent feil",
  },
  da: {
    "settings.speech.hybridTtsBackend.label": "TTS (hybrid)",
    "settings.speech.hybridTtsBackend.piper": "Piper (offline, anbefalet)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (anbefalet til europæiske sprog)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (anbefalet til japansk og kinesisk)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Whisper anbefales til det valgte appsprog.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "SenseVoice anbefales, når appsproget er japansk eller kinesisk.",
    "settings.speech.asrStatus.ready.sense_voice_int8": "SenseVoice-model fundet og klar.",
    "settings.speech.ttsTest.label": "Test taleoutput",
    "settings.speech.ttsTest.placeholder": "Eksempeltekst til oplæsningstest…",
    "settings.speech.ttsTest.button": "Afspil test",
    "settings.speech.ttsTest.testing": "Syntetiserer og afspiller…",
    "settings.speech.ttsTest.success": "Afspilning startet ({backend}, stemme: {voice}).",
    "settings.speech.ttsTest.failed": "Test mislykkedes: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS kræver internet. Piper-fallback er deaktiveret, når Edge TTS er valgt.",
    "settings.speech.ttsTest.piperHint":
      "Installer Piper-stemmer: npm run download:speech-tts (en installeret stemme vælges automatisk)",
    "settings.speech.ttsTest.piperMissing":
      "Ingen Piper-stemme installeret. Kør npm run download:speech-tts eller skift TTS til Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Ukendt fejl",
  },
  el: {
    "settings.speech.hybridTtsBackend.label": "TTS (υβριδικό)",
    "settings.speech.hybridTtsBackend.piper": "Piper (εκτός σύνδεσης, συνιστάται)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, online)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (συνιστάται για ευρωπαϊκές γλώσσες)",
    "settings.speech.localAsrModel.sense_voice_int8":
      "SenseVoice (συνιστάται για ιαπωνικά και κινέζικα)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "Το Whisper συνιστάται για την επιλεγμένη γλώσσα της εφαρμογής.",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "Το SenseVoice συνιστάται όταν η γλώσσα της εφαρμογής είναι ιαπωνικά ή κινέζικα.",
    "settings.speech.asrStatus.ready.sense_voice_int8":
      "Το μοντέλο SenseVoice βρέθηκε και είναι έτοιμο.",
    "settings.speech.ttsTest.label": "Δοκιμή φωνητικής εξόδου",
    "settings.speech.ttsTest.placeholder": "Δείγμα κειμένου για τη δοκιμή ανάγνωσης…",
    "settings.speech.ttsTest.button": "Αναπαραγωγή δοκιμής",
    "settings.speech.ttsTest.testing": "Σύνθεση και αναπαραγωγή…",
    "settings.speech.ttsTest.success": "Η αναπαραγωγή ξεκίνησε ({backend}, φωνή: {voice}).",
    "settings.speech.ttsTest.failed": "Η δοκιμή απέτυχε: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Το Edge TTS απαιτεί διαδίκτυο. Το fallback Piper είναι απενεργοποιημένο όταν είναι επιλεγμένο το Edge TTS.",
    "settings.speech.ttsTest.piperHint":
      "Εγκατάσταση φωνών Piper: npm run download:speech-tts (επιλέγεται αυτόματα μια εγκατεστημένη φωνή)",
    "settings.speech.ttsTest.piperMissing":
      "Δεν υπάρχει εγκατεστημένη φωνή Piper. Εκτελέστε npm run download:speech-tts ή αλλάξτε το TTS σε Microsoft Edge (online).",
    "settings.speech.ttsTest.unknownError": "Άγνωστο σφάλμα",
  },
  hi: {
    "settings.speech.hybridTtsBackend.label": "TTS (हाइब्रिड)",
    "settings.speech.hybridTtsBackend.piper": "Piper (ऑफ़लाइन, अनुशंसित)",
    "settings.speech.hybridTtsBackend.edgeTts": "Microsoft Edge (edge-tts, ऑनलाइन)",
    "settings.speech.localAsrModel.whisper_small_de":
      "Whisper Small (यूरोपीय भाषाओं के लिए अनुशंसित)",
    "settings.speech.localAsrModel.sense_voice_int8": "SenseVoice (जापानी और चीनी के लिए अनुशंसित)",
    "settings.speech.localAsrModel.whisperRecommendedHint":
      "चयनित ऐप भाषा के लिए Whisper अनुशंसित है।",
    "settings.speech.localAsrModel.senseVoiceRecommendedHint":
      "जब ऐप भाषा जापानी या चीनी हो, तो SenseVoice अनुशंसित है।",
    "settings.speech.asrStatus.ready.sense_voice_int8": "SenseVoice मॉडल मिल गया और तैयार है।",
    "settings.speech.ttsTest.label": "वाक् आउटपुट का परीक्षण",
    "settings.speech.ttsTest.placeholder": "पढ़ने के परीक्षण के लिए नमूना पाठ…",
    "settings.speech.ttsTest.button": "परीक्षण चलाएँ",
    "settings.speech.ttsTest.testing": "संश्लेषण और प्लेबैक…",
    "settings.speech.ttsTest.success": "प्लेबैक शुरू ({backend}, आवाज़: {voice})।",
    "settings.speech.ttsTest.failed": "परीक्षण विफल: {message}",
    "settings.speech.ttsTest.edgeHint":
      "Edge TTS के लिए इंटरनेट आवश्यक है। Edge TTS चुने जाने पर Piper फ़ॉलबैक अक्षम है।",
    "settings.speech.ttsTest.piperHint":
      "Piper आवाज़ें इंस्टॉल करें: npm run download:speech-tts (एक इंस्टॉल की गई आवाज़ स्वचालित रूप से चुनी जाती है)",
    "settings.speech.ttsTest.piperMissing":
      "कोई Piper आवाज़ इंस्टॉल नहीं है। npm run download:speech-tts चलाएँ या TTS को Microsoft Edge (ऑनलाइन) पर बदलें।",
    "settings.speech.ttsTest.unknownError": "अज्ञात त्रुटि",
  },
};

function writeJson(filePath, data) {
  const lines = Object.entries(data).map(([key, value]) => `  "${key}": ${JSON.stringify(value)}`);
  fs.writeFileSync(filePath, `{\n${lines.join(",\n")}\n}\n`, "utf8");
}

for (const locale of Object.keys(TRANSLATIONS)) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const patch = TRANSLATIONS[locale];

  for (const key of PATCH_KEYS) {
    if (!(key in patch)) {
      throw new Error(`Missing translation ${locale}.${key}`);
    }
    data[key] = patch[key];
  }

  writeJson(filePath, data);
  console.log(`Updated ${locale}.json (${PATCH_KEYS.length} keys)`);
}

console.log("Done.");
