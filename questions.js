const securityQuestions = [
  {
    category: 'Basisbeveiliging',
    questions: [
      {
        subcategory: 'Antivirus',
        question: 'Draait er antivirussoftware op alle apparaten waar dat mogelijk is?',
        action: 'Installeer vandaag een antivirusprogramma op alle apparaten waarop dat mogelijk is.',
        howTo: 'Controleer of er al een antivirusprogramma actief is en schakel het in. Indien nodig, kies een betrouwbaar antivirusprogramma en installeer het.',
        why: 'Een up-to-date antivirusprogramma beschermt IT-systemen tegen virussen en malware.'
      },
      {
        subcategory: 'Updaten',
        question: 'Staat automatisch updaten aan op alle met internet verbonden apparaten?',
        action: 'Controleer en schakel automatisch updaten in.',
        howTo: 'Ga naar de instellingen van je apparaten en activeer automatische updates.',
        why: 'Updates bevatten belangrijke beveiligingspatches om kwetsbaarheden te verhelpen.'
      },
      {
        subcategory: 'Inloggen in 2 stappen',
        question: 'Log je in 2 stappen in bij belangrijke bedrijfsapplicaties?',
        action: 'Stel vandaag een 2e inlogmethode in.',
        howTo: 'Schakel tweestapsverificatie (2FA) in via de instellingen van bedrijfsapplicaties.',
        why: '2FA maakt het moeilijker voor cybercriminelen om toegang te krijgen tot accounts.'
      },
      {
        subcategory: 'Ieder een eigen account',
        question: 'Gebruiken alle medewerkers persoonsgebonden accounts?',
        action: 'Zorg ervoor dat iedereen een individueel account gebruikt.',
        howTo: 'Vervang gedeelde accounts door persoonlijke accounts.',
        why: 'Individuele accounts zorgen voor betere controle en beveiliging.'
      },
      {
        subcategory: 'Beperkte installatierechten',
        question: 'Hebben medewerkers beperkte installatierechten?',
        action: 'Beperk installatierechten voor medewerkers.',
        howTo: 'Zorg ervoor dat standaard gebruikers geen software kunnen installeren zonder goedkeuring.',
        why: 'Voorkomt dat malware en schadelijke software geïnstalleerd worden.'
      },
      {
        subcategory: 'Medewerkers in en uit dienst',
        question: 'Is er een protocol voor in- en uitdiensttreding om ongeautoriseerde toegang te voorkomen?',
        action: 'Stel een in- en uitdiensttredingsbeleid op.',
        howTo: 'Leg vast wie toegang heeft tot welke systemen en voor welke periode.',
        why: 'Voorkomt dat ex-medewerkers toegang behouden tot bedrijfssystemen.'
      },
      {
        subcategory: 'Rollen en rechten',
        question: 'Is er een duidelijke scheiding tussen bedrijfsrollen en toegangsrechten?',
        action: 'Maak een rechtenmatrix.',
        howTo: 'Breng in kaart welke medewerkers welke toegangsrechten nodig hebben.',
        why: 'Zorgt voor overzicht en voorkomt ongeautoriseerde toegang.'
      },
      {
        subcategory: 'Back-up',
        question: 'Wordt er geregeld een back-up gemaakt van de belangrijkste bedrijfsgegevens?',
        action: 'Maak vandaag een back-up van de belangrijkste bestanden.',
        howTo: 'Kopieer bestanden naar een externe harde schijf of een andere online omgeving.',
        why: 'Voorkomt dataverlies bij incidenten zoals ransomware of hardware defecten.'
      }
    ]
  },
  {
    category: 'Toegangsbeheer',
    questions: [
      {
        subcategory: 'Inloggen in 2 stappen',
        question: 'Log je in 2 stappen in bij belangrijke bedrijfsapplicaties?',
        action: 'Stel vandaag een 2e inlogmethode in.',
        howTo: 'Schakel tweestapsverificatie (2FA) in via de instellingen van bedrijfsapplicaties.',
        why: '2FA maakt het moeilijker voor cybercriminelen om toegang te krijgen tot accounts.'
      },
      {
        subcategory: 'Ieder een eigen account',
        question: 'Gebruiken alle medewerkers persoonsgebonden accounts?',
        action: 'Zorg ervoor dat iedereen een individueel account gebruikt.',
        howTo: 'Vervang gedeelde accounts door persoonlijke accounts.',
        why: 'Individuele accounts zorgen voor betere controle en beveiliging.'
      },
      {
        subcategory: 'Beperkte installatierechten',
        question: 'Hebben medewerkers beperkte installatierechten?',
        action: 'Beperk installatierechten voor medewerkers.',
        howTo: 'Zorg ervoor dat standaard gebruikers geen software kunnen installeren zonder goedkeuring.',
        why: 'Voorkomt dat malware en schadelijke software geïnstalleerd worden.'
      },
      {
        subcategory: 'Medewerkers in en uit dienst',
        question: 'Is er een protocol voor in- en uitdiensttreding om ongeautoriseerde toegang te voorkomen?',
        action: 'Stel een in- en uitdiensttredingsbeleid op.',
        howTo: 'Leg vast wie toegang heeft tot welke systemen en voor welke periode.',
        why: 'Voorkomt dat ex-medewerkers toegang behouden tot bedrijfssystemen.'
      },
      {
        subcategory: 'Rollen en rechten',
        question: 'Is er een duidelijke scheiding tussen bedrijfsrollen en toegangsrechten?',
        action: 'Maak een rechtenmatrix.',
        howTo: 'Breng in kaart welke medewerkers welke toegangsrechten nodig hebben.',
        why: 'Zorgt voor overzicht en voorkomt ongeautoriseerde toegang.'
      }
    ]
  },
  {
    category: 'Back-ups',
    questions: [
      {
        subcategory: 'Back-up',
        question: 'Wordt er geregeld een back-up gemaakt van de belangrijkste bedrijfsgegevens?',
        action: 'Maak vandaag een back-up van de belangrijkste bestanden.',
        howTo: 'Kopieer bestanden naar een externe harde schijf of een andere online omgeving.',
        why: 'Voorkomt dataverlies bij incidenten zoals ransomware of hardware defecten.'
      }
    ]
  }
];

module.exports = {
  securityQuestions
};