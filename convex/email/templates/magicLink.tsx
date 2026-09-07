import { Heading, Text } from "@react-email/components";

import { BrandButton, FallbackUrl, Signoff } from "./_components";
import { EmailLayout } from "./_layout";

interface MagicLinkEmailProps {
  url: string;
  appName?: string;
}

export default function MagicLinkEmail({ url, appName }: MagicLinkEmailProps) {
  const product = appName ?? process.env.APP_NAME ?? "Starter Template";

  return (
    <EmailLayout preview={`Your sign-in link for ${product}`} appName={appName}>
      <Heading className="mt-0 mb-4 text-2xl font-bold text-gray-900">Sign in to {product}</Heading>
      <Text className="text-base leading-6 text-gray-700">
        Use the button below to sign in. For your security, this link expires in 5 minutes and can only be used once.
      </Text>
      <BrandButton href={url}>Sign in</BrandButton>
      <FallbackUrl url={url} />
      <Text className="text-sm leading-5 text-gray-500">
        If you didn't request this link, you can safely ignore this email.
      </Text>
      <Signoff />
    </EmailLayout>
  );
}
