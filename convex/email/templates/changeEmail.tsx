import { Heading, Text } from "@react-email/components";

import { BrandButton, FallbackUrl, SecurityNotice, Signoff } from "./_components";
import { EmailLayout } from "./_layout";

interface ChangeEmailProps {
  url: string;
  newEmail: string;
  appName?: string;
}

export default function ChangeEmail({ url, newEmail, appName }: ChangeEmailProps) {
  const product = appName ?? process.env.APP_NAME ?? "Starter Template";

  return (
    <EmailLayout preview={`Confirm your ${product} email change`} appName={appName}>
      <Heading className="mt-0 mb-4 text-2xl font-bold text-gray-900">Confirm email change</Heading>
      <Text className="text-base leading-6 text-gray-700">
        Confirm that you want to change your {product} email to <strong>{newEmail}</strong>. This link expires in 1
        hour.
      </Text>
      <BrandButton href={url}>Confirm email change</BrandButton>
      <FallbackUrl url={url} />
      <SecurityNotice action="request this change" />
      <Signoff />
    </EmailLayout>
  );
}
