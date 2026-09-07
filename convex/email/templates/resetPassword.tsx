import { Heading, Text } from "@react-email/components";

import { BrandButton, FallbackUrl, SecurityNotice, Signoff } from "./_components";
import { EmailLayout } from "./_layout";

interface ResetPasswordEmailProps {
  url: string;
  appName?: string;
}

export default function ResetPasswordEmail({ url, appName }: ResetPasswordEmailProps) {
  const product = appName ?? process.env.APP_NAME ?? "Starter Template";

  return (
    <EmailLayout preview={`Reset your ${product} password`} appName={appName}>
      <Heading className="mt-0 mb-4 text-2xl font-bold text-gray-900">Reset your password</Heading>
      <Text className="text-base leading-6 text-gray-700">
        We received a request to reset the password for your {product} account. Choose a new password using the button
        below — this link expires in 1 hour.
      </Text>
      <BrandButton href={url}>Reset password</BrandButton>
      <FallbackUrl url={url} />
      <SecurityNotice action="request a password reset" />
      <Signoff />
    </EmailLayout>
  );
}
