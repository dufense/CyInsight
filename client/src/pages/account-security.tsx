import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Shield, Key, Fingerprint, Loader2, CheckCircle2, XCircle,
  Plus, Trash2, QrCode, Hash, Clock, RefreshCw, AlertTriangle, Lock, Phone,
} from "lucide-react";
import { PageHero } from "@/components/page-hero";

interface MfaDevice {
  id: number;
  type: "totp" | "webauthn" | "sms" | "radius";
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
}

interface MfaStatus {
  mfaEnabled: boolean;
}

const DEVICE_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  totp: { label: "Authenticator App (TOTP)", icon: Hash, color: "text-green-400" },
  webauthn: { label: "Passkey / Hardware Key", icon: Fingerprint, color: "text-blue-400" },
  sms: { label: "SMS One-Time Password", icon: Phone, color: "text-yellow-400" },
  radius: { label: "RADIUS / RSA Token", icon: Key, color: "text-purple-400" },
};

function TOTPEnrollPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "qr" | "verify">("idle");
  const [qrUri, setQrUri] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");

  const setupMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/auth/mfa/setup", {});
      return r.json();
    },
    onSuccess: (data: any) => {
      setQrUri(data.qrCodeUrl || data.otpauth || "");
      setSecret(data.secret || "");
      setStep("qr");
    },
    onError: (e: any) => toast({ title: "Setup failed", description: e.message, variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/auth/mfa/verify", { token });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Authenticator app enrolled", description: "TOTP MFA is now active on your account." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/status"] });
      onDone();
    },
    onError: (e: any) => toast({ title: "Verification failed", description: e.message, variant: "destructive" }),
  });

  if (step === "idle") return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Use an authenticator app (Google Authenticator, Authy, 1Password) to generate time-based codes.</p>
      <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending} data-testid="button-totp-start">
        {setupMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
        <QrCode className="w-3.5 h-3.5 mr-1.5" /> Set Up Authenticator App
      </Button>
    </div>
  );

  if (step === "qr") return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app, then enter the 6-digit code below.</p>
      {qrUri && qrUri.startsWith("data:image") ? (
        <img src={qrUri} alt="TOTP QR Code" className="w-40 h-40 rounded-lg border border-border" />
      ) : (
        <div className="p-3 bg-muted rounded-lg text-xs font-mono break-all text-muted-foreground" data-testid="text-totp-secret">{secret}</div>
      )}
      <div className="space-y-1.5">
        <Label>Verification Code</Label>
        <Input value={token} onChange={e => setToken(e.target.value)} placeholder="000000" maxLength={6} className="w-32 font-mono text-center text-lg tracking-widest" data-testid="input-totp-token" />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setStep("idle")}>Back</Button>
        <Button size="sm" onClick={() => verifyMutation.mutate()} disabled={token.length < 6 || verifyMutation.isPending} data-testid="button-totp-verify">
          {verifyMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Verify & Enable
        </Button>
      </div>
    </div>
  );

  return null;
}

function SmsEnrollPanel({ onDone }: { onDone: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<"phone" | "confirm">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");

  const enrollMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/auth/mfa/sms/enroll", { phone });
      return r.json();
    },
    onSuccess: () => setStep("confirm"),
    onError: (e: any) => toast({ title: "Enrollment failed", description: e.message, variant: "destructive" }),
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/auth/mfa/sms/confirm", { code });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "SMS MFA enrolled" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/devices"] });
      onDone();
    },
    onError: (e: any) => toast({ title: "Confirmation failed", description: e.message, variant: "destructive" }),
  });

  if (step === "phone") return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Enter your mobile number to receive one-time codes via SMS.</p>
      <div className="space-y-1.5">
        <Label>Phone Number (E.164 format)</Label>
        <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 000 0000" data-testid="input-sms-phone" />
      </div>
      <Button onClick={() => enrollMutation.mutate()} disabled={!phone || enrollMutation.isPending} data-testid="button-sms-enroll">
        {enrollMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
        <Phone className="w-3.5 h-3.5 mr-1.5" /> Save & Send Code
      </Button>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <strong>{phone}</strong>.</p>
      <div className="space-y-1.5">
        <Label>SMS Code</Label>
        <Input value={code} onChange={e => setCode(e.target.value)} placeholder="000000" maxLength={6} className="w-32 font-mono text-center text-lg tracking-widest" data-testid="input-sms-code" />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setStep("phone")}>Back</Button>
        <Button size="sm" onClick={() => confirmMutation.mutate()} disabled={code.length < 6 || confirmMutation.isPending} data-testid="button-sms-confirm">
          {confirmMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
          Confirm & Enable
        </Button>
      </div>
    </div>
  );
}

function EnrollDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [method, setMethod] = useState<"totp" | "sms" | null>(null);

  const handleDone = () => { setMethod(null); onClose(); };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" /> Enroll a New MFA Device
          </DialogTitle>
        </DialogHeader>

        {!method && (
          <div className="grid grid-cols-2 gap-3 pt-2">
            {[
              { type: "totp" as const, icon: Hash, label: "Authenticator App", desc: "Google Authenticator, Authy, 1Password" },
              { type: "sms" as const, icon: Phone, label: "SMS Code", desc: "Receive codes on your mobile number" },
            ].map(m => (
              <button
                key={m.type}
                onClick={() => setMethod(m.type)}
                className="flex flex-col items-start gap-2 p-4 border border-border rounded-xl hover:border-primary/50 hover:bg-muted/50 transition-all text-left"
                data-testid={`button-mfa-method-${m.type}`}
              >
                <m.icon className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {method === "totp" && <TOTPEnrollPanel onDone={handleDone} />}
        {method === "sms" && <SmsEnrollPanel onDone={handleDone} />}

        {method && (
          <div className="pt-1">
            <Button variant="ghost" size="sm" onClick={() => setMethod(null)}>← Back to method selection</Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeviceCard({ device, onRemove }: { device: MfaDevice; onRemove: () => void }) {
  const meta = DEVICE_TYPE_META[device.type] || DEVICE_TYPE_META.totp;
  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-3 p-3 border border-border rounded-xl bg-card hover:border-border/80 transition-colors" data-testid={`card-mfa-device-${device.id}`}>
      <div className={`p-2.5 rounded-lg bg-muted ${meta.color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{device.label}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <Badge variant="outline" className="text-[9px] h-4 px-1.5">{meta.label}</Badge>
          {device.lastUsedAt && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              Last used {new Date(device.lastUsedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive shrink-0" data-testid={`button-remove-device-${device.id}`}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove MFA Device</AlertDialogTitle>
            <AlertDialogDescription>
              Remove <strong>{device.label}</strong>? You will no longer be able to use this device for authentication.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove} className="bg-destructive hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AccountSecurityPage() {
  const { toast } = useToast();
  const [enrollOpen, setEnrollOpen] = useState(false);

  const { data: devices = [], isLoading: devicesLoading, refetch: refetchDevices } = useQuery<MfaDevice[]>({
    queryKey: ["/api/auth/mfa/devices"],
  });

  const { data: status } = useQuery<MfaStatus>({
    queryKey: ["/api/auth/mfa/status"],
  });

  const { data: userProfile } = useQuery<any>({
    queryKey: ["/api/user/profile"],
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/auth/mfa/devices/${id}`);
    },
    onSuccess: () => {
      toast({ title: "MFA device removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/status"] });
    },
    onError: (e: any) => toast({ title: "Failed to remove device", description: e.message, variant: "destructive" }),
  });

  const disableTotpMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/mfa/disable", {});
    },
    onSuccess: () => {
      toast({ title: "TOTP MFA disabled" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/mfa/devices"] });
    },
    onError: (e: any) => toast({ title: "Failed to disable", description: e.message, variant: "destructive" }),
  });

  const isMfaActive = status?.mfaEnabled || devices.length > 0;
  const username = userProfile?.username || userProfile?.email || "Your Account";
  const ssoProvider = userProfile?.ssoProvider;

  return (
    <div className="min-h-screen bg-background">
      <PageHero
        icon={Shield}
        title="Account Security"
        description="Manage multi-factor authentication and identity settings for your account."
        badge={isMfaActive ? "MFA Active" : "MFA Inactive"}
        stats={[
          { label: "Enrolled Devices", value: String(devices.length) },
          { label: "Account", value: username },
          { label: "Auth Method", value: ssoProvider ? `SSO (${ssoProvider})` : "Password" },
        ]}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Status overview */}
        <Card className={`border ${isMfaActive ? "border-green-500/30 bg-green-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
          <CardContent className="flex items-center gap-4 py-4">
            {isMfaActive ? (
              <CheckCircle2 className="w-8 h-8 text-green-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-yellow-400 shrink-0" />
            )}
            <div className="flex-1">
              <p className="font-semibold text-sm">{isMfaActive ? "Multi-Factor Authentication is enabled" : "No MFA methods enrolled"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isMfaActive
                  ? `${devices.length} device(s) enrolled. Your account is protected with an additional verification step.`
                  : "Add an MFA method to significantly improve your account security."}
              </p>
            </div>
            <Button onClick={() => setEnrollOpen(true)} size="sm" data-testid="button-add-mfa-device">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Device
            </Button>
          </CardContent>
        </Card>

        {/* SSO banner if SSO user */}
        {ssoProvider && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardContent className="flex items-center gap-3 py-3">
              <Lock className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-300">Identity managed via SSO</p>
                <p className="text-xs text-muted-foreground">Your account is authenticated through <strong>{ssoProvider}</strong>. Password login is disabled. MFA may be enforced by your identity provider.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enrolled devices */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Enrolled MFA Devices</CardTitle>
                <CardDescription className="text-xs mt-0.5">Verification methods registered to your account.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchDevices()} data-testid="button-refresh-devices">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {devicesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading devices…
              </div>
            ) : devices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No MFA devices enrolled yet.</p>
                <Button className="mt-3" size="sm" variant="outline" onClick={() => setEnrollOpen(true)} data-testid="button-enroll-first">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Enroll your first device
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {devices.map(d => (
                  <DeviceCard key={d.id} device={d} onRemove={() => removeMutation.mutate(d.id)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Authenticator App (TOTP) legacy section */}
        {status?.mfaEnabled && (
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Hash className="w-4 h-4 text-green-400" /> Legacy TOTP (Authenticator App)
              </CardTitle>
              <CardDescription className="text-xs">Your account has TOTP MFA enabled via the legacy system.</CardDescription>
            </CardHeader>
            <CardContent>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" data-testid="button-disable-totp">
                    <XCircle className="w-3.5 h-3.5 mr-1.5" /> Disable TOTP
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disable TOTP MFA?</AlertDialogTitle>
                    <AlertDialogDescription>This will remove the authenticator app requirement from your account. You can re-enable it at any time.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => disableTotpMutation.mutate()} className="bg-destructive hover:bg-destructive/90">Disable</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

        {/* Security tips */}
        <Card className="border-border/40 bg-muted/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Security Recommendations</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs text-muted-foreground">
              {[
                "Enroll at least two MFA methods in case you lose access to one.",
                "Use a hardware security key or passkey for the strongest protection.",
                "Keep your phone number up to date if using SMS authentication.",
                "Never share your MFA codes with anyone, including support staff.",
              ].map((tip, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <EnrollDialog open={enrollOpen} onClose={() => setEnrollOpen(false)} />
    </div>
  );
}
