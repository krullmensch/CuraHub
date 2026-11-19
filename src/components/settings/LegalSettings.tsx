import { useAuthStore } from '@/store/authStore';
import { LegalTextsEditor } from '@/components/users/LegalTextsEditor';

/** Settings → Administration → Rechtliche Angaben: operator details, Impressum, Datenschutz. */
export function LegalSettings() {
  const token = useAuthStore((s) => s.token);
  return (
    <div className="max-w-3xl">
      <p className="text-xs text-zinc-400 mb-5">
        Aus diesen Angaben erzeugt CuraHub Impressum und Datenschutzerklärung (unter /impressum und /datenschutz,
        von jeder öffentlichen Seite verlinkt). Die Datenschutzerklärung beschreibt, was CuraHub verarbeitet; lass sie
        von deiner bzw. deinem Datenschutzbeauftragten prüfen. Wer einen eigenen Text braucht, stellt auf „Eigener Text“ um.
      </p>
      {token && <LegalTextsEditor token={token} />}
    </div>
  );
}
