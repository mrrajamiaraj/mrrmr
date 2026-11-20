# Card artwork notes

## Products (from the app's card configuration)
| Slot | Bank | Product (as configured) | Verified against |
| --- | --- | --- | --- |
| 1 | City Bank PLC (Bangladesh) | American Express "Blue" credit card | City Bank is the sole issuer of American Express cards in Bangladesh; the card list on American Express's City Bank page names "The City Bank Blue American Express® Card" — https://www.americanexpress.com/en-bd/network/credit-cards/city-bank/ |
| 2 | Community Bank Bangladesh PLC | Visa Platinum credit card | The bank's credit card page lists "VISA Gold and Platinum Credit Cards" — https://www.communitybankbd.com/credit-card/ |

## Official artwork: not used
The usage rights for either bank's official card art (and the American Express / Visa marks) could not be confirmed,
so no official image was downloaded, hotlinked or copied. Both cards use **original MRRMR illustrations** instead,
drawn in each bank's verified brand colours, with the bank name set as plain text.

| File | Colours | Source of the colours (read 2026-11-19) |
| --- | --- | --- |
| `public/cards/city-bank.svg` | red `#F20823`, near-black `#231F20` | City Bank website stylesheet — https://www.thecitybank.com/ (most-used colours in its CSS) |
| `public/cards/community-bank.svg` | blue `#058ED0`, navy `#32327B`, platinum-grey lines | Community Bank website — https://www.communitybankbd.com/ (most-used colours in its markup) |

## Rules followed
* Only the last four digits the app already stores are shown. There is no field for a full card number or CVV.
* The artwork is a background only: bank, product, masked number and cardholder are real text on top. Balances,
  due dates and limits are never part of the image; the card page shows them beside it as text.
* Assets are local files in `public/cards/`; nothing is loaded from a bank's site.
* To use official art later, replace the two SVGs with permitted files and record the permission and source URL here.
