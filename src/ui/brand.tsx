import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useRemote, useSession } from "./state";
import { Mark } from "./Mark";
import { ErrorNotice, Notice } from "./primitives";

export interface Brand { portalName: string; primaryColor: string; accentColor: string; logoUrl: string | null; revision: number }
/** The buyer's portal name, logo and two colors, applied across the signed-in portal; Linen's own look is unchanged until an owner sets one. */
export function useBrand() {
  const remote = useRemote<{ brand: Brand | null }>("/branding"), brand = remote.data?.brand ?? null;
  useEffect(() => {
    const root = document.documentElement.style, shade = (hex: string) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.9).toString(16).padStart(2, "0")).join("")}`;
    if (!brand) return;
    root.setProperty("--marigold-bright", brand.primaryColor); root.setProperty("--marigold-hover", shade(brand.primaryColor)); root.setProperty("--denim", brand.accentColor); root.setProperty("--denim-ink", brand.accentColor);
    return () => { for (const name of ["--marigold-bright", "--marigold-hover", "--denim", "--denim-ink"]) root.removeProperty(name); };
  }, [brand]);
  return { brand, refresh: remote.refresh };
}
export function BrandMark({ brand }: { brand: Brand | null }) {
  return brand?.logoUrl ? <img className="mark brand-logo" src={brand.logoUrl} alt="" height={46} style={{ height: 46, width: "auto", maxWidth: 160, objectFit: "contain" }} /> : <Mark size={46} />;
}
/** Owner settings for the portal's branding. */
export function BrandSettings({ onSaved }: { onSaved: () => void }) {
  const { session } = useSession(), remote = useRemote<{ brand: Brand | null }>("/branding"), mutation = useMutation(), [saved, setSaved] = useState(false);
  if (!session.principal.roles.includes("owner")) return null;
  const brand = remote.data?.brand;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaved(false);
    const form = new FormData(event.currentTarget), file = form.get("logo") as File | null;
    let logo: { type: string; base64: string } | undefined;
    if (file && file.size) logo = { type: file.type, base64: btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer()))) };
    const result = await mutation.mutate("/branding", { portalName: form.get("portalName"), primaryColor: form.get("primaryColor"), accentColor: form.get("accentColor"), revision: brand?.revision ?? 0, removeLogo: form.get("removeLogo") === "on", ...(logo ? { logo } : {}) });
    if (result) { setSaved(true); remote.refresh(); onSaved(); }
  }
  return (
    <details className="evidence" open={Boolean(brand)} aria-label="Portal branding">
      <summary>Portal branding</summary>
      <form className="inline-form" onSubmit={save} key={brand?.revision ?? 0}>
        <label>Portal name<input name="portalName" required maxLength={60} defaultValue={brand?.portalName ?? ""} /></label>
        <label>Primary color<input name="primaryColor" type="color" defaultValue={brand?.primaryColor ?? "#f5a623"} /></label>
        <label>Accent color<input name="accentColor" type="color" defaultValue={brand?.accentColor ?? "#3d5f8c"} /></label>
        <label>Logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label>
        {brand?.logoUrl && <label className="checkbox-field"><input name="removeLogo" type="checkbox" /> <span>Remove the current logo</span></label>}
        <Notice>Shown to every employee in the portal and in notification mail. PNG, JPEG or WebP up to 150 KB; colors must stay readable. A custom domain such as help.example.com is not available yet.</Notice>
        <ErrorNotice error={mutation.error} />
        {saved && <Notice>Saved. Employees see the new branding on their next page load.</Notice>}
        <div className="button-row"><button className="action primary" disabled={mutation.pending}>Save branding</button></div>
      </form>
    </details>
  );
}
