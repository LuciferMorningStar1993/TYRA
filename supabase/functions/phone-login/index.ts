// Inicio de sesión con teléfono + contraseña.
//
// Supabase solo permite teléfono+contraseña nativo con un proveedor de SMS (de pago).
// En TYRA el teléfono vive en profiles.phone y la cuenta real es de correo: esta función
// busca el correo del teléfono con permisos de admin (sin exponerlo al cliente),
// valida la contraseña con Auth y devuelve la sesión.
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const E164 = /^\+[1-9][0-9]{7,14}$/;

const INVALID_CREDENTIALS = Response.json(
  { error: "invalid_credentials" },
  { status: 401 },
);

export default {
  fetch: withSupabase({ auth: ["publishable"] }, async (req, ctx) => {
    if (req.method !== "POST") {
      return Response.json({ error: "method_not_allowed" }, { status: 405 });
    }

    const { phone, password } = await req.json().catch(() => ({}));
    if (typeof phone !== "string" || !E164.test(phone) || typeof password !== "string" || !password) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }

    const { data: profile } = await ctx.supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (!profile) return INVALID_CREDENTIALS.clone();

    const { data: userData } = await ctx.supabaseAdmin.auth.admin.getUserById(profile.id);
    const email = userData?.user?.email;
    if (!email) return INVALID_CREDENTIALS.clone();

    const { data, error } = await ctx.supabase.auth.signInWithPassword({ email, password });
    // Contraseña correcta pero correo sin confirmar: se avisa sin revelar el correo.
    if (error?.code === "email_not_confirmed") {
      return Response.json({ error: "email_not_confirmed" }, { status: 403 });
    }
    if (error || !data.session) return INVALID_CREDENTIALS.clone();

    return Response.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }),
};
