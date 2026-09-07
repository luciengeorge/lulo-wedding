import { Heading, Text } from "@react-email/components";

import { BrandButton, FallbackUrl, Signoff } from "./_components";
import { EmailLayout } from "./_layout";

interface VerifyEmailProps {
  url: string;
  appName?: string;
}

export default function VerifyEmail({ url, appName }: VerifyEmailProps) {
  const product = appName ?? process.env.APP_NAME ?? "Starter Template";

  return (
    <EmailLayout preview={`Verify your email for ${product}`} appName={appName}>
      <Heading className="mt-0 mb-4 text-2xl font-bold text-gray-900">Verify your email</Heading>
      <Text className="text-base leading-6 text-gray-700">
        Thanks for signing up for {product}. Confirm your email address to activate your account — this link expires in
        1 hour.
      </Text>
      <BrandButton href={url}>Verify email</BrandButton>
      <FallbackUrl url={url} />
      <Signoff />
    </EmailLayout>
  );
}
