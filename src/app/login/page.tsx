import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return (
    <LoginForm
      initialError={
        error === "auth_callback"
          ? "Authentication failed. Request a new sign-in link."
          : null
      }
    />
  );
}
