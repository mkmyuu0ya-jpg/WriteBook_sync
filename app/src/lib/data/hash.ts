/** 本文のハッシュ（SHA-256 の 16 進）。「投稿後に修正あり」「公開に未反映の変更あり」の判定に使う。 */
export async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
