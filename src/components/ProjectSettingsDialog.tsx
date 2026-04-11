import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useEditorStore } from '../store/editorStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { DateRangePicker } from "@/components/ui/date-picker";
import type { DateRange } from "react-day-picker";
import { Loader2, Upload, Trash2, UserPlus, X, Image, Search } from 'lucide-react';
import { gooeyToast } from 'goey-toast';

interface Collaborator {
  id: number;
  user: { id: number; email: string; role: string };
  invitedBy: { id: number; email: string };
}

interface ExhibitionData {
  id: number;
  title: string;
  start_date: string | null;
  end_date: string | null;
  poster_path: string | null;
}

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettingsDialog({ open, onOpenChange }: ProjectSettingsDialogProps) {
  const token = useAuthStore((s) => s.token);
  const activeExhibitionId = useEditorStore((s) => s.activeExhibitionId);


  // General settings
  const [title, setTitle] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [posterPath, setPosterPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Poster upload
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const posterInputRef = useRef<HTMLInputElement>(null);

  // Collaborators
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [eligibleUsers, setEligibleUsers] = useState<{ id: number; email: string; role: string }[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [inviting, setInviting] = useState<number | null>(null); // userId being invited

  // Load exhibition data when dialog opens
  useEffect(() => {
    if (!open || !activeExhibitionId || !token) return;

    setLoading(true);
    Promise.all([
      fetch(`/api/exhibitions/${activeExhibitionId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(r => r.ok ? r.json() : null),
      fetch(`/api/exhibitions/${activeExhibitionId}/collaborators`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(r => r.ok ? r.json() : []),
      fetch(`/api/exhibitions/${activeExhibitionId}/eligible-collaborators`, {
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(r => r.ok ? r.json() : []),
    ]).then(([exhibition, collabs, eligible]: [ExhibitionData | null, Collaborator[], { id: number; email: string; role: string }[]]) => {
      if (exhibition) {
        setTitle(exhibition.title);
        const from = exhibition.start_date ? new Date(exhibition.start_date) : undefined;
        const to = exhibition.end_date ? new Date(exhibition.end_date) : undefined;
        setDateRange(from || to ? { from, to } : undefined);
        setPosterPath(exhibition.poster_path);
      }
      setCollaborators(collabs);
      setEligibleUsers(eligible);
    }).catch(() => {
      gooeyToast.error('Fehler', { description: 'Daten konnten nicht geladen werden.' });
    }).finally(() => setLoading(false));
  }, [open, activeExhibitionId, token]);

  const handleSaveGeneral = async () => {
    if (!activeExhibitionId || !token) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title || undefined,
          start_date: dateRange?.from ? dateRange.from.toISOString() : null,
          end_date: dateRange?.to ? dateRange.to.toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Fehler');
      }
      // Update the project name in the store so the header/selector reflects it immediately
      if (title) {
        useEditorStore.setState({ activeProjectName: title });
      }
      gooeyToast.success('Gespeichert', { description: 'Einstellungen wurden aktualisiert.' });
    } catch (err) {
      gooeyToast.error('Fehler', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const uploadPosterFile = async (file: File) => {
    if (!activeExhibitionId || !token) return;
    setUploadingPoster(true);
    try {
      const formData = new FormData();
      formData.append('poster', file);
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/poster`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) throw new Error('Upload fehlgeschlagen');
      const data = await res.json();
      setPosterPath(data.poster_path);
      gooeyToast.success('Poster hochgeladen', { description: 'Das Poster wurde gespeichert.' });
    } catch {
      gooeyToast.error('Fehler', { description: 'Poster konnte nicht hochgeladen werden.' });
    } finally {
      setUploadingPoster(false);
      if (posterInputRef.current) posterInputRef.current.value = '';
    }
  };

  const handlePosterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadPosterFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) uploadPosterFile(file);
  };

  const handleRemovePoster = async () => {
    if (!activeExhibitionId || !token) return;
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/poster`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setPosterPath(null);
      gooeyToast.success('Poster entfernt');
    } catch {
      gooeyToast.error('Fehler', { description: 'Poster konnte nicht entfernt werden.' });
    }
  };

  const handleInvite = async (user: { id: number; email: string; role: string }) => {
    if (!activeExhibitionId || !token) return;
    setInviting(user.id);
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/collaborators`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        gooeyToast.error('Fehler', { description: data.error || 'Fehler beim Einladen' });
        return;
      }
      setCollaborators(prev => [...prev, data]);
      setEligibleUsers(prev => prev.filter(u => u.id !== user.id));
      gooeyToast.success('Eingeladen', { description: `${user.email} wurde hinzugefügt.` });
    } catch {
      gooeyToast.error('Netzwerkfehler');
    } finally {
      setInviting(null);
    }
  };

  const handleRemoveCollaborator = async (collaborator: Collaborator) => {
    if (!activeExhibitionId || !token) return;
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/collaborators/${collaborator.user.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setCollaborators(prev => prev.filter(c => c.user.id !== collaborator.user.id));
      // Add back to eligible list if they're curator or prof
      if (collaborator.user.role === 'curator' || collaborator.user.role === 'prof') {
        setEligibleUsers(prev => [...prev, collaborator.user].sort((a, b) => a.email.localeCompare(b.email)));
      }
      gooeyToast.success('Entfernt', { description: 'Kollaborateur wurde entfernt.' });
    } catch {
      gooeyToast.error('Fehler', { description: 'Konnte nicht entfernt werden.' });
    }
  };

  const roleBadge = (role: string) => {
    const labels: Record<string, string> = { curator: 'Kurator', prof: 'Prof', admin: 'Admin' };
    return labels[role] || role;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[85vh] overflow-y-auto overflow-x-visible">
        <DialogHeader>
          <DialogTitle className="text-lg font-display">Projekteinstellungen</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Section 1: Allgemein */}
            <section>
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Allgemein</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="exhibition-title" className="text-zinc-300 text-xs">Ausstellungsname</Label>
                  <Input
                    id="exhibition-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 bg-zinc-900 border-zinc-700 text-white"
                    placeholder="Name der Ausstellung"
                  />
                </div>
                <div>
                  <Label className="text-zinc-300 text-xs">Ausstellungszeitraum</Label>
                  <div className="mt-1">
                    <DateRangePicker value={dateRange} onChange={setDateRange} placeholder="Zeitraum wählen" />
                  </div>
                </div>
                <Button
                  onClick={handleSaveGeneral}
                  disabled={saving || !title.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Speichern
                </Button>
              </div>
            </section>

            <Separator className="bg-zinc-800" />

            {/* Section 2: Poster */}
            <section>
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Poster</h3>
              {posterPath ? (
                <div className="space-y-3">
                  <div
                    className={`relative rounded-lg overflow-hidden border bg-zinc-900 transition-colors ${isDragging ? 'border-blue-500 bg-blue-950/20' : 'border-zinc-800'}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <img
                      src={`/${posterPath}`}
                      alt="Poster"
                      className="w-full h-40 object-cover"
                    />
                    {isDragging && (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/70 text-sm text-blue-300">
                        Bild ablegen zum Ersetzen
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => posterInputRef.current?.click()}
                      disabled={uploadingPoster}
                      className="flex-1 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800"
                    >
                      {uploadingPoster ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Upload className="h-3.5 w-3.5 mr-2" />}
                      Ersetzen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRemovePoster}
                      className="border-zinc-700 text-red-400 hover:text-red-300 hover:bg-red-950/30"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Entfernen
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => posterInputRef.current?.click()}
                  disabled={uploadingPoster}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`w-full flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed transition-colors text-zinc-500 ${isDragging ? 'border-blue-500 bg-blue-950/20 text-blue-300' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50 hover:bg-zinc-900 hover:text-zinc-300'}`}
                >
                  {uploadingPoster ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    <Image className="h-8 w-8" />
                  )}
                  <span className="text-sm">
                    {uploadingPoster ? 'Wird hochgeladen…' : isDragging ? 'Bild ablegen…' : 'Klicken oder Bild hierher ziehen'}
                  </span>
                  <span className="text-xs text-zinc-600">JPG, PNG oder WebP · max. 10 MB</span>
                </button>
              )}
              <input
                ref={posterInputRef}
                type="file"
                accept="image/*"
                onChange={handlePosterUpload}
                className="hidden"
              />
            </section>

            <Separator className="bg-zinc-800" />

            {/* Section 3: Kuratoren */}
            <section>
              <h3 className="text-sm font-medium text-zinc-400 uppercase tracking-wider mb-3">Kuratoren</h3>

              {/* Current collaborators */}
              {collaborators.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {collaborators.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-200 truncate">{c.user.email.split('@')[0]}</p>
                        <p className="text-xs text-zinc-500">{roleBadge(c.user.role)}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveCollaborator(c)}
                        className="shrink-0 ml-2 p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                        title="Entfernen"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Eligible users list */}
              {eligibleUsers.length === 0 ? (
                <p className="text-xs text-zinc-600 text-center py-4">
                  {collaborators.length === 0 ? 'Keine Kuratoren oder Professoren verfügbar.' : 'Alle verfügbaren Benutzer wurden hinzugefügt.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    <Input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Benutzer suchen…"
                      className="pl-8 bg-zinc-900 border-zinc-700 text-white text-sm"
                    />
                  </div>
                  {/* User list */}
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
                    {eligibleUsers
                      .filter(u => u.email.toLowerCase().includes(userSearch.toLowerCase()))
                      .map(u => (
                        <div key={u.id} className="flex items-center justify-between px-2.5 py-2 rounded-md hover:bg-zinc-800 transition-colors">
                          <div className="min-w-0">
                            <p className="text-sm text-zinc-200 truncate">{u.email.split('@')[0]}</p>
                            <p className="text-xs text-zinc-500">{roleBadge(u.role)}</p>
                          </div>
                          <button
                            onClick={() => handleInvite(u)}
                            disabled={inviting === u.id}
                            className="shrink-0 ml-2 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-950/30 px-2 py-1 rounded transition-colors disabled:opacity-50"
                          >
                            {inviting === u.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <UserPlus className="h-3 w-3" />}
                            Hinzufügen
                          </button>
                        </div>
                      ))
                    }
                    {eligibleUsers.filter(u => u.email.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                      <p className="text-xs text-zinc-600 text-center py-3">Keine Treffer</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
