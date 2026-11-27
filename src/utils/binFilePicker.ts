import { Capacitor, registerPlugin } from "@capacitor/core";
import { onBeforeUnmount, ref } from "vue";
import { isNativeGameApp } from "./runtimePlatform";

interface BinFilePickerPlugin {
  pick: (options: { multiple: boolean }) => Promise<{
    files: Array<{ name: string; data: string }>;
  }>;
}

const BinFilePicker = registerPlugin<BinFilePickerPlugin>("BinFilePicker");

/** Feed selected native files into the same validation queue used by browser imports. */
export function useBinFilePicker(
  onFile: (file: File) => unknown,
  onError: (message: string) => unknown,
) {
  const nativeBinPicker = isNativeGameApp() && Capacitor.isPluginAvailable("BinFilePicker");
  const isPickingBin = ref(false);
  let disposed = false;
  onBeforeUnmount(() => { disposed = true; });

  async function pickBinFiles() {
    if (!nativeBinPicker || isPickingBin.value) return;
    isPickingBin.value = true;
    try {
      const { files } = await BinFilePicker.pick({ multiple: true });
      if (disposed) return;
      for (const { name, data } of files) {
        const binary = atob(data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) {
          bytes[index] = binary.charCodeAt(index);
        }
        onFile(new File([bytes], name, { type: "application/octet-stream" }));
      }
    } catch (error) {
      if (!disposed) {
        onError(error instanceof Error ? error.message : "文件选择失败，请重新选择");
      }
    } finally {
      isPickingBin.value = false;
    }
  }

  return { nativeBinPicker, isPickingBin, pickBinFiles };
}
