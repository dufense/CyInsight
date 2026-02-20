import { Shield, BarChart3, Lock, Zap, ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
          <a href="/api/login">
            <Button size="sm" data-testid="button-login">
              Sign In
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </a>
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
              <div className="flex flex-wrap items-center gap-3">
                <a href="/api/login">
                  <Button size="lg" data-testid="button-get-started">
                    Get Started
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </a>
              </div>
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

            <div className="relative hidden lg:block">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-chart-3/5 rounded-2xl" />
              <Card className="relative">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">Security Posture Score</span>
                    <span className="text-2xl font-bold text-chart-2">87</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="bg-chart-2 h-2 rounded-full" style={{ width: "87%" }} />
                  </div>
                  <div className="grid grid-cols-3 gap-3 pt-2">
                    {[
                      { label: "Critical", value: "3", color: "text-destructive" },
                      { label: "High", value: "12", color: "text-chart-4" },
                      { label: "Medium", value: "28", color: "text-chart-1" },
                    ].map(stat => (
                      <div key={stat.label} className="text-center p-3 rounded-md bg-muted/50">
                        <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                        <div className="text-[10px] text-muted-foreground">{stat.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2 pt-2">
                    {["Firewall breach attempt detected", "Suspicious login from new geo", "Malware signature matched"].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/30">
                        <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-destructive" : i === 1 ? "bg-chart-4" : "bg-chart-1"}`} />
                        <span className="text-xs text-muted-foreground">{item}</span>
                      </div>
                    ))}
                  </div>
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
