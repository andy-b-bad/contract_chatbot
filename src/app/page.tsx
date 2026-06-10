import { ChatClient } from "./chat-client";
import { DEFAULT_CONTRACT_SCOPE } from "./contracts";
import { getOrCreateChatThread, listChatMessages } from "@/lib/chat-persistence";
import { getInitialScope } from "@/lib/chat";
import { isAuthEnabled } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAnonymousSupabaseUser } from "@/lib/supabase/user";

export default async function Home() {
  const authEnabled = isAuthEnabled();

  if (!authEnabled) {
    return (
      <ChatClient
        authEnabled={false}
        initialChatId={null}
        initialMessages={[]}
        initialScope={DEFAULT_CONTRACT_SCOPE}
        isAnonymousUser={false}
        sessionUserId={null}
        userEmail={null}
      />
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ChatClient
        authEnabled={authEnabled}
        initialChatId={null}
        initialMessages={[]}
        initialScope={DEFAULT_CONTRACT_SCOPE}
        isAnonymousUser={false}
        sessionUserId={null}
        userEmail={null}
      />
    );
  }

  const chatId = await getOrCreateChatThread(supabase, user.id);
  const initialMessages = await listChatMessages(supabase, chatId, user.id);
  const initialScope = getInitialScope(initialMessages);

  return (
    <ChatClient
      authEnabled={authEnabled}
      initialChatId={chatId}
      initialMessages={initialMessages}
      initialScope={initialScope}
      isAnonymousUser={isAnonymousSupabaseUser(user)}
      sessionUserId={user.id}
      userEmail={user.email ?? null}
    />
  );
}
