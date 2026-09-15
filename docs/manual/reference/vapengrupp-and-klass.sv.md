# Vapengrupp och klass

Två oberoende saker, och appen håller isär dem eftersom de svarar på olika
frågor.

- **Vapengrupp** beskriver **vapnet**. Den ändras när du plockar upp en annan
  pistol — ett A-vapen och ett C-vapen samma dag är två vapengrupper.
- **Klass** beskriver **skytten**. Den är en egenskap hos dig, och densamma hela
  dagen oavsett vilket vapen du håller i.

Skrivna tillsammans ser de ut som en enda sak — "C 2" — men det är en
visningskonvention, inte ett värde. Att hålla dem åtskilda är det som låter dig
fråga "hur skjuter jag med C-vapnet?" och "hur går det för mig i klass 2?" var
för sig.

## Vapengrupper

| Kod                    | Vad det är                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------- |
| **A**                  | Centralantänd, 7,6–11,4 mm, 420–600 J                                                   |
| **AM**, **AP**, **AG** | Undergrupper till A — militär före 1945, Walther PP/PPK 7,65, Glock med fasta riktmedel |
| **A-opt**              | A med optiskt sikte                                                                     |
| **B**                  | Centralantänd pistol eller revolver, upp till 600 J                                     |
| **C**                  | Endast .22 LR                                                                           |
| **R**                  | Grovkalibrig revolver — endast fält och militär snabbmatch, aldrig precision            |
| **airgun**             | Luftpistol. Ingen SPSF-grupp — du sätter den på vapnet, aldrig på ett pass              |

Magnumgrupperna M1–M9 finns i SPSF:s regler men erbjuds inte, eftersom
magnumprecision inte är en gren appen har ännu. De skulle dyka upp som
alternativ till ett pass du sedan inte kunde skapa.

## Klasser

| Klass                           | Vem som skjuter den                      |
| ------------------------------- | ---------------------------------------- |
| **1**                           | Ingångsklass                             |
| **2**                           | Mellanklass                              |
| **3**                           | Riksmästarklass — den högsta klassen     |
| **Jun**                         | Junior                                   |
| **Dam 1**, **Dam 2**, **Dam 3** | Damklasser                               |
| **Vet Y**                       | Veteran yngre — från det år du fyller 60 |
| **Vet Ä**                       | Veteran äldre — från det år du fyller 70 |

Veteranklasserna går efter det **år** du uppnår åldern, inte efter din
födelsedag, och det är därför appen frågar efter ditt födelseår.

Fri träning har ingen klass, och appen visar ingen i stället för att erbjuda ett
"ingen" att välja. ISSF har inte heller någon klass — där används **grenar**
i stället, vilket nästa avsnitt förklarar.

## ISSF: grenar i stället för klasser

De två förbunden svarar på samma fråga på olika ställen.

- **SPSF** har en gren med många klasser. Precision är precision; C 2, C Dam 2
  och C Vet Y är starter inuti den. Kategorin sitter på **dig**.
- **ISSF** har många grenar, var och en låst till en kategori. 10 m luftpistol
  körs som fyra separata grenar — herrar, herrjunior, damer, damjunior — och
  25 m snabbpistol har bara de två för herrar, eftersom det inte finns någon
  damvariant. Kategorin sitter på **grenen**.

Ett ISSF- eller SvSF-pass frågar därför vilken **gren** det var, på samma plats
där ett SPSF-pass frågar efter din klass. Det är den ena väljaren eller den
andra, aldrig båda.

| Gren                | Grenar (kategorier)                  |
| ------------------- | ------------------------------------ |
| 10 m luftpistol     | Herrar, herrjunior, damer, damjunior |
| 25 m snabbpistol    | Herrar, herrjunior                   |
| 25 m standardpistol | Herrar, herrjunior, damer, damjunior |
| 25 m sportpistol    | Herrjunior, damer, damjunior         |
| 50 m pistol         | Herrar, herrjunior, damer, damjunior |

**25 m sportpistol har ingen seniorgren för herrar.** Det är ingen glömska:
ISSF erkänner den bara för damer, damjuniorer och herrjuniorer.

En **junior** är för ISSF den som är upp till och med det år hen fyller 21 — ett
år senare än SPSF:s juniorklass, som slutar det år man fyller 20. Appen använder
den som gäller för grenen du valt.

Juniorer är inte inlåsta i juniorgrenar. Att starta i seniorgrenen är normalt
och förväntat, och det svenska förbundet säger det rakt ut: vid SM för herrar får
en herrjunior delta. Appen listar därför **alla** grenar för grenvalet, lägger
dem som passar dig först, och förväljer den första av dem — samma
rangordna-men-spärra-inte-regel som för klasser.

## Vilka grupper varje gren tillåter

| Gren                    | Grupper                                |
| ----------------------- | -------------------------------------- |
| SPSF precision          | A, AM, AP, AG, A-opt, B, C             |
| SPSF militär snabbmatch | A, A-opt, B, C, R                      |
| ISSF-grenar             | inga — ISSF använder inte vapengrupper |
| Träning (ringad tavla)  | inga — se nedan                        |

## Bara tävlingar frågar dig

En vapengrupp och en klass är det du är **anmäld i**, så appen frågar efter dem
när passet är en tävling och annars inte.

Ett träningspass bär ändå en vapengrupp — den tas från vapnet du valde, så att
pistolskyttemärket fortsätter räkna dina träningsserier — och det registrerar
ingen klass. Om ett vapen ligger i flera vapengrupper och ingen av dem är
markerad som dess standard frågar appen i stället för att gissa.

Du kan alltid rätta endera i efterhand: när du redigerar ett pass visas det som
finns sparat.

**Träning har ingen vapengrupp.** En vapengrupp är hur SPSF sorterar vapen i
tävlingsklasser, så den betyder ingenting på ett träningspass som inte tillhör
något förbund. Appen frågar efter vapnet i stället, och vapnet bär sin egen
grupp — vilket är varför _airgun_ ändå finns att välja när du lägger till en
luftpistol bland dina vapen.

## Du har flera klasser samtidigt

En klass är inte en enda plats du sitter på. De nio SPSF-klasserna är i själva
verket två saker på en gång:

- **Din klass** — 1, 2 eller 3 (riksmästarklass). Skjuten till sig, och en enda
  klass över alla vapengrupper.
- **Kategorier** — Jun, Dam 1/2/3, Vet Y, Vet Ä.

En kvinna på 62 i klass 2 som skjuter C får alltså starta i **C 2**, **C Dam 2**
_och_ **C Vet Y**, och väljer en per tävling.

Två regler formar det (SHB F.2.1 och F.2.2, s. 163):

- **De öppna klasserna är verkligen öppna.** En skytt i dam-, junior- eller
  veteranklass får i stället starta i klass 1, 2 eller 3 efter sin kompetens, i
  vapengrupp A, B eller C. Att starta i sin kategoriklass är uttryckligen
  frivilligt.
- **Jun, Dam och Vet finns bara i vapengrupp C.** Klass 1/2/3 körs i A, B och C,
  men det finns ingen "A Dam 2" — så att välja ett A-vapen lämnar dig bara de
  öppna klasserna. Appen smalnar av listan efter vapnet du väljer.

Ytterligare en sak, värd att känna till innan du anmäler dig i två: inom
**vapengrupp C i precision är huvudregeln en klass per tävling** — Vet Y _och_
klass 3 C tillsammans är normalt inte tillåtet.

**Mästerskap är undantaget.** Vid SM, landsdels- eller kretsmästerskap får en
arrangör tillåta en start i den öppna klassen utöver din egen, och skyttar
tävlar där i C och en annan klass. Det är arrangörens beslut, så appen hindrar
dig aldrig från att logga någondera starten.

Din klass är densamma oavsett vilket vapen du skjuter: _"Skytt hänförs till viss
klass oavsett i vilken vapengrupp kompetensfordringarna uppfyllts"_ (F.2.2).
Bara klass 3 kvalificerar man sig till i just precision.

Appen räknar ut det den kan och frågar efter resten:

| Behörighet                       | Hur appen vet                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------- |
| **Vet Y** (60+), **Vet Ä** (70+) | Ditt födelseår                                                                    |
| **Jun**                          | Ditt födelseår — det år du fyller 20                                              |
| **Dam 1/2/3**                    | Brytaren "Damklasser och damgrenar" under Inställningar → Personligt              |
| **1 / 2 / 3**                    | "Din klass" under Inställningar → Personligt — ingen kan härleda en skjuten klass |

Ålderskategorier avgörs av **året**, inte av din födelsedag, i både SPSF och
ISSF — vilket är varför ett födelseår räcker och appen aldrig frågar efter ett
fullständigt födelsedatum.

När du skapar ett pass listas de klasser du är behörig till först, och din egen
klass är förvald. **Varje klass går fortfarande att välja**: en klubbkväll kan
sätta vem som helst i vilken klass som helst, och appen säger inte emot dig.

## Vilket reglemente de kommer från

Vapengrupper definieras av ett förbund, och det är därför deras id:n är
förbundsprefixade — `spsf:C` snarare än ett naket `C`. Ett annat förbund kan
definiera sitt eget `C` utan att krocka med det här.

Vilka av dem du erbjuds beror på vilka reglementen du slagit på; se
[Reglementen](../guides/regulations.md). ISSF levererar grenar i stället för
vapengrupper, så ett ISSF- eller SvSF-pass har ingen vapengrupp att välja.
