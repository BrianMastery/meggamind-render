// Configuración de Remotion. Docs: https://www.remotion.dev/docs/config
import { Config } from "@remotion/cli/config";

// PNG para soportar fondo transparente: los overlays se superponen sobre el footage real.
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);
