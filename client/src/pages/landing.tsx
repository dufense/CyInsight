import { useState } from "react";
import { Shield, BarChart3, Lock, Zap, ChevronRight, User, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

const features = [
  {
    icon: Shield,
    title: "Incident Orchestration",
    description: "Centralize and manage security incidents across all your clients with real-time dashboards and AI-powered analysis.",
  },
  {
    icon: BarChart3,
    title: "Executive Reporting",
    description: "Generate stunning monthly reports with findings, recommendations, and executive summaries powered by AI.",
  },
  {
    icon: Lock,
    title: "Multi-Tenant Security",
    description: "Securely manage multiple clients with role-based access control and isolated data environments.",
  },
  {
    icon: Zap,
    title: "AI-Powered Intelligence",
    description: "Leverage artificial intelligence to enrich incidents, auto-generate reports, and surface critical insights.",
  },
];

export default function LandingPage() {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: "Login failed", description: data.message || "Invalid credentials", variant: "destructive" });
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/user/profile"] });
      window.location.href = "/";
    } catch (error) {
      toast({ title: "Login failed", description: "Connection error", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 w-full z-50 border-b border-border/50 backdrop-blur-xl bg-background/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Shield className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight">SecureOps</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-muted-foreground transition-colors">Features</a>
            <a href="#platform" className="text-sm text-muted-foreground transition-colors">Platform</a>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-chart-2 animate-pulse" />
                <span className="text-xs text-muted-foreground">AI-Powered MSSP Platform</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight leading-[1.1]">
                Security Operations,{" "}
                <span className="text-primary">Elevated</span>
              </h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-lg">
                The complete platform for Managed Security Service Providers. Orchestrate incidents,
                generate premium reports, and manage client operations with intelligence.
              </p>
              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-chart-2" />
                  <span className="text-xs text-muted-foreground">Enterprise Security</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-chart-4" />
                  <span className="text-xs text-muted-foreground">AI-Enabled</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <Card className="relative max-w-md mx-auto">
                <CardContent className="p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary">
                      <Shield className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold">Sign In</h2>
                      <p className="text-xs text-muted-foreground">Access your security dashboard</p>
                    </div>
                  </div>
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Username</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          placeholder="Enter username"
                          className="pl-10"
                          required
                          data-testid="input-username"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Password</Label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Enter password"
                          className="pl-10"
                          required
                          data-testid="input-password"
                        />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={loginLoading} data-testid="button-login-submit">
                      {loginLoading ? "Signing in..." : "Sign In"}
                      {!loginLoading && <ChevronRight className="w-4 h-4 ml-1" />}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-3xl md:text-4xl font-serif font-bold">
              Everything You Need
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A unified platform built for MSSPs to manage incidents, generate reports,
              handle support tickets, and track projects -- all in one place.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <Card key={i} className="hover-elevate group">
                <CardContent className="p-6 flex gap-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 shrink-0">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-semibold">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">SecureOps MSSP Platform</span>
          </div>
          <p className="text-xs text-muted-foreground">2026 SecureOps. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
