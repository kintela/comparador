import "server-only";

import nodemailer from "nodemailer";

function variableObligatoria(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

function configuracionSmtp() {
  const puerto = Number.parseInt(variableObligatoria("SMTP_PORT"), 10);
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65_535) {
    throw new Error("SMTP_PORT no contiene un puerto válido");
  }

  return {
    host: variableObligatoria("SMTP_HOST"),
    port: puerto,
    secure: process.env.SMTP_SECURE?.trim().toLowerCase() === "true",
    requireTLS: puerto === 587,
    auth: {
      user: variableObligatoria("SMTP_USER"),
      pass: variableObligatoria("SMTP_PASSWORD"),
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  };
}

export function obtenerDestinatarioInforme(): string {
  return (
    process.env.SMTP_REPORT_TO?.trim() || "roberto.quintela@protonmail.com"
  );
}

export async function verificarServidorSmtp(): Promise<void> {
  const transporte = nodemailer.createTransport(configuracionSmtp());
  await transporte.verify();
  transporte.close();
}

export async function enviarCorreo({
  destinatario,
  asunto,
  texto,
  html,
}: {
  destinatario: string;
  asunto: string;
  texto: string;
  html: string;
}): Promise<{ messageId: string }> {
  const remitente = variableObligatoria("SMTP_FROM_EMAIL");
  const transporte = nodemailer.createTransport(configuracionSmtp());

  try {
    const resultado = await transporte.sendMail({
      from: `Comparador de precios <${remitente}>`,
      to: destinatario,
      subject: asunto,
      text: texto,
      html,
    });
    return { messageId: resultado.messageId };
  } finally {
    transporte.close();
  }
}
