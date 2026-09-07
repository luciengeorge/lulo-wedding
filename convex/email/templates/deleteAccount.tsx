import { Heading, Text } from "@react-email/components";

import { BrandButton, FallbackUrl, SecurityNotice, Signoff } from "./_components";
import { EmailLayout } from "./_layout";

interface DeleteAccountProps {
  url: string;
  appName?: string;
}

export default function DeleteAccount({ url, appName }: DeleteAccountProps) {
  const product = appName ?? process.env.APP_NAME ?? "Starter Template";

  return (
    <EmailLayout preview={`Confirm deletion of your ${product} account`} appName={appName}>
      <Heading className="mt-0 mb-4 text-2xl font-bold text-gray-900">Confirm account deletion</Heading>
      <Text className="text-base leading-6 text-gray-700">
        We received a request to permanently delete your {product} account and all associated data. This action is
        irreversible. Confirm with the button below — the link expires in 24 hours.
      </Text>
      <BrandButton href={url} destructive>
        Delete my account
      </BrandButton>
      <FallbackUrl url={url} />
      <SecurityNotice action="request account deletion" />
      <Signoff />
    </EmailLayout>
  );
}
