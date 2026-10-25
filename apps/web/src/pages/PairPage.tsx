import { LockScreen, setJustPaired } from "../components/LockScreen";
import { useAuth } from "../lib/auth-context";

const ALERT = ["Pairing required", "Enter the 4-digit code shown in the Open EFB app on your PC."] as const;

export function PairPage() {
  const { pair } = useAuth();

  const onPin = async (code: string) => {
    setJustPaired(true);
    try {
      await pair(code);
    } catch (e) {
      setJustPaired(false);
      throw e;
    }
  };

  return <LockScreen plan={null} pill={["Not paired", "bg-amber"]} alert={ALERT} onPin={onPin} />;
}